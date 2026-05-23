from flask import Blueprint, request, jsonify, current_app, abort
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from flask_bcrypt import Bcrypt
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
from functools import wraps
import os
import json
import base64
import uuid

mobile_api = Blueprint('mobile_api', __name__)
jwt = JWTManager()
bcrypt = Bcrypt()

# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────
VALID_FEATURES = [
    'wheelchair_ramp', 'accessible_restroom', 'braille_signage',
    'accessible_parking', 'elevator', 'audio_assistance',
    'wide_doorways', 'automatic_doors'
]

MAX_PHOTO_BYTES = 5 * 1024 * 1024           # 5MB per photo
MAX_PHOTOS_PER_LOCATION = 10                # cap per request


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
def _current_user_id():
    """
    Return the current user's id as an int.

    flask-jwt-extended 4.6+ requires the identity claim to be a string.
    We store ids as strings in the token and convert back here so
    SQLAlchemy lookups (which expect ints for integer PKs) still work.
    """
    raw = get_jwt_identity()
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def get_current_user():
    """Retrieve the User object for the currently authenticated JWT identity."""
    from models import User
    from extensions import db
    user_id = _current_user_id()
    if user_id is None:
        return None
    return db.session.get(User, user_id)


def _safe_json_loads(value, default=None):
    """
    json.loads() that never raises. Returns `default` on any error.

    Used for JSON columns in the DB (accessibility_settings) and for
    JSON strings embedded in form-data request bodies.
    """
    if value is None or value == '':
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def _escape_like(s):
    """
    Escape SQL LIKE wildcards (%, _, backslash) so user input is treated
    as a literal substring instead of a pattern.
    """
    if not s:
        return ''
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _generate_unique_filename(original):
    """
    Produce a filesystem-safe filename that won't collide with concurrent
    uploads. Format: YYYYMMDD_HHMMSS_<8hexchars>_<sanitized>.ext
    """
    safe = secure_filename(original) or 'upload.bin'
    stamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    token = uuid.uuid4().hex[:8]
    return f"{stamp}_{token}_{safe}"


def admin_required_api(fn):
    """Decorator that requires both a valid JWT and admin privileges."""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user or not user.is_admin:
            return jsonify({'error': 'Admin access required'}), 403
        return fn(*args, **kwargs)
    return wrapper


def _location_query_options():
    """
    Eagerly load every relationship that _serialize_location touches.

    Without this, each attribute access (loc.photos, loc.reviews, etc.)
    fires a separate lazy-load SQL query per location — the classic N+1
    problem. Under a slow or strict Supabase staging connection this
    causes Gunicorn workers to time out and crash with SIGKILL.

    selectinload issues one extra query per relationship for the whole
    result set (e.g. "SELECT * FROM photos WHERE location_id IN (1,2,3)")
    instead of one query per row, which is dramatically more efficient.

    We also chain .selectinload(Review.author) so that accessing
    r.author inside _serialize_location doesn't fire yet another round
    of lazy loads for every review.
    """
    from models import Location, Review
    return [
        selectinload(Location.photos),
        selectinload(Location.accessibility_features),
        selectinload(Location.reviews).selectinload(Review.author),
        selectinload(Location.creator),
    ]


def _serialize_location(loc, include_reviews=True):
    """
    Consistent dict representation of a Location for API responses.
    Centralized here so /locations, /locations/:id, /my-locations all
    return the same field set.

    IMPORTANT: all relationships (loc.photos, loc.accessibility_features,
    loc.reviews, loc.creator) must already be eagerly loaded before this
    function is called. Use _location_query_options() on the query that
    fetches the location(s).
    """
    features = [{
        'type':     f.feature_type,
        'available': f.available,
        'notes':    f.notes,
        'notes_ar': f.notes_ar,
    } for f in loc.accessibility_features]

    photos = [photo.filename for photo in loc.photos]

    avg_rating = (sum(r.rating for r in loc.reviews) / len(loc.reviews)
                  if loc.reviews else 0)

    result = {
        'id':             loc.id,
        'name':           loc.name,
        'name_ar':        loc.name_ar,
        'description':    loc.description,
        'description_ar': loc.description_ar,
        'category':       loc.category,
        'latitude':       loc.latitude,
        'longitude':      loc.longitude,
        'address':        loc.address,
        'address_ar':     loc.address_ar,
        'accessibility_features': features,
        'photos':         photos,
        'avg_rating':     round(avg_rating, 1),
        'review_count':   len(loc.reviews),
        'creator':        loc.creator.username if loc.creator else None,
        'creator_type':   loc.creator.user_type if loc.creator else None,
        'is_verified':    loc.is_verified,
        'user_id':        loc.user_id,
        'created_at':     loc.created_at.isoformat() if loc.created_at else None,
    }

    if include_reviews:
        result['reviews'] = [{
            'id':         r.id,
            'user':       r.author.username if r.author else 'Unknown',
            'user_id':    r.user_id,
            'rating':     r.rating,
            'comment':    r.comment,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        } for r in loc.reviews]

    return result


def _save_base64_photos(photos_raw, location_id):
    """
    Save base64-encoded photos from a request payload.

    Enforces size and count caps. Accepts either a list of dicts or a
    JSON string (coming in via multipart/form-data).

    Returns the number of photos successfully saved.
    """
    from models import Photo
    from extensions import db

    if isinstance(photos_raw, str):
        photos_raw = _safe_json_loads(photos_raw, default=[])
    if not isinstance(photos_raw, list):
        return 0

    # Enforce a hard cap regardless of what the client sends
    photos_raw = photos_raw[:MAX_PHOTOS_PER_LOCATION]

    saved = 0
    for photo_data in photos_raw:
        if not isinstance(photo_data, dict):
            continue
        if not photo_data.get('data') or not photo_data.get('filename'):
            continue

        try:
            img_bytes = base64.b64decode(photo_data['data'])
        except (ValueError, TypeError):
            continue  # bad base64, skip silently

        if len(img_bytes) > MAX_PHOTO_BYTES:
            continue  # skip oversized

        filename = _generate_unique_filename(photo_data['filename'])
        upload_folder = current_app.config['UPLOAD_FOLDER']
        os.makedirs(upload_folder, exist_ok=True)
        filepath = os.path.join(upload_folder, filename)

        try:
            with open(filepath, 'wb') as f:
                f.write(img_bytes)
        except OSError:
            continue  # disk error, skip

        db.session.add(Photo(location_id=location_id, filename=filename))
        saved += 1

    return saved


def _save_multipart_photos(files_list, location_id):
    """Save photo files from a multipart/form-data request."""
    from models import Photo
    from extensions import db

    saved = 0
    files_list = files_list[:MAX_PHOTOS_PER_LOCATION]

    for file in files_list:
        if not file or not file.filename:
            continue

        # Size check — seek to end, tell, seek back
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > MAX_PHOTO_BYTES:
            continue

        filename = _generate_unique_filename(file.filename)
        upload_folder = current_app.config['UPLOAD_FOLDER']
        os.makedirs(upload_folder, exist_ok=True)
        filepath = os.path.join(upload_folder, filename)

        try:
            file.save(filepath)
        except OSError:
            continue

        db.session.add(Photo(location_id=location_id, filename=filename))
        saved += 1

    return saved


# ═════════════════════════════════════════════
#  HEALTH
# ═════════════════════════════════════════════

@mobile_api.route('/health', methods=['GET'])
def api_health():
    """
    Lightweight health check used by the mobile app's network probe.

    Returns:
        200: { status: 'ok', timestamp: '2026-...' }
    """
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat(),
    }), 200


# ═════════════════════════════════════════════
#  AUTH ENDPOINTS
# ═════════════════════════════════════════════

@mobile_api.route('/auth/signup', methods=['POST'])
def api_signup():
    """
    Register a new user account.

    Request JSON:
    {
        "username": "string (required)",
        "email": "string (required)",
        "password": "string (required, min 6 chars)",
        "user_type": "individual | organization (required)",
        "organization_name": "string (optional, required if user_type=organization)",
        "disability": "string | null (optional)"
    }

    Returns:
        201: { success, message, user: { id, username, email, user_type, is_admin } }
        400: { error } on validation failure
        409: { error } on duplicate email/username
    """
    from models import User
    from extensions import db
    ADMIN_EMAILS = current_app.config.get('ADMIN_EMAILS', [])

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    user_type = data.get('user_type') or 'individual'
    organization_name = data.get('organization_name')
    disability = data.get('disability')

    if not username or not email or not password:
        return jsonify({'error': 'Username, email, and password are required'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if user_type not in ('individual', 'organization'):
        return jsonify({'error': 'user_type must be "individual" or "organization"'}), 400

    if user_type == 'organization' and not organization_name:
        return jsonify({'error': 'organization_name is required for organization accounts'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 409

    is_admin = email in ADMIN_EMAILS
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

    try:
        user = User(
            username=username,
            email=email,
            password=hashed_password,
            user_type=user_type,
            org_name=organization_name if user_type == 'organization' else None,
            disability=disability,
            is_admin=is_admin,
        )
        db.session.add(user)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to create account'}), 500

    return jsonify({
        'success': True,
        'message': 'Account created successfully',
        'user': {
            'id':        user.id,
            'username':  user.username,
            'email':     user.email,
            'user_type': user.user_type,
            'is_admin':  user.is_admin,
        },
    }), 201


@mobile_api.route('/auth/login', methods=['POST'])
def api_login():
    """
    Authenticate and receive JWT tokens.

    Request JSON: { "email": str, "password": str }

    Returns:
        200: { access_token, refresh_token, user: {...} }
        401: { error } on invalid credentials
    """
    from models import User

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    # IMPORTANT: identity MUST be a string under flask-jwt-extended >= 4.6.
    # We also stash is_admin in additional_claims so the refresh endpoint
    # can preserve it without another DB lookup.
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={'is_admin': user.is_admin},
    )
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'access_token':  access_token,
        'refresh_token': refresh_token,
        'user': {
            'id':                user.id,
            'username':          user.username,
            'email':             user.email,
            'user_type':         user.user_type,
            'organization_name': user.org_name,
            'disability':        user.disability,
            'is_admin':          user.is_admin,
            'accessibility_settings': _safe_json_loads(user.accessibility_settings),
            'created_at':        user.created_at.isoformat() if user.created_at else None,
        },
    }), 200


@mobile_api.route('/auth/refresh', methods=['POST'])
@jwt_required(refresh=True)
def api_refresh():
    """
    Refresh an expired access token using a valid refresh token.

    Headers: Authorization: Bearer <refresh_token>

    Returns:
        200: { access_token }
        404: { error } if the user has been deleted since the token was issued
    """
    from models import User
    from extensions import db

    user_id = _current_user_id()
    if user_id is None:
        return jsonify({'error': 'Invalid token identity'}), 401

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={'is_admin': user.is_admin},
    )
    return jsonify({'access_token': access_token}), 200


@mobile_api.route('/auth/me', methods=['GET'])
@jwt_required()
def api_me():
    """
    Get the currently authenticated user's profile.

    Returns:
        200: { user: {...} }
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'user': {
            'id':                user.id,
            'username':          user.username,
            'email':             user.email,
            'user_type':         user.user_type,
            'organization_name': user.org_name,
            'disability':        user.disability,
            'is_admin':          user.is_admin,
            'accessibility_settings': _safe_json_loads(user.accessibility_settings),
            'created_at':        user.created_at.isoformat() if user.created_at else None,
            'location_count':    len(user.locations),
            'review_count':      len(user.reviews),
        },
    }), 200


# ═════════════════════════════════════════════
#  LOCATIONS ENDPOINTS
# ═════════════════════════════════════════════

@mobile_api.route('/locations', methods=['GET'])
def api_get_locations():
    """
    Get all locations with optional filtering.

    Query params:
        category (string): Filter by category name (substring match)
        feature (string):  Filter to locations with this accessibility feature
        verified (bool):   Filter verified only (true/false)
        search (string):   Search by name/name_ar/address

    Returns:
        200: [ { ...location dict... } ]
    """
    from models import Location, Review

    query = Location.query.options(*_location_query_options())

    category = request.args.get('category')
    if category:
        # Escape wildcards so ?category=% doesn't return everything
        pattern = f'%{_escape_like(category)}%'
        query = query.filter(Location.category.ilike(pattern, escape='\\'))

    verified = request.args.get('verified')
    if verified is not None:
        query = query.filter_by(is_verified=verified.lower() == 'true')

    search = request.args.get('search')
    if search:
        pattern = f'%{_escape_like(search)}%'
        query = query.filter(
            Location.name.ilike(pattern, escape='\\') |
            Location.name_ar.ilike(pattern, escape='\\') |
            Location.address.ilike(pattern, escape='\\') |
            Location.address_ar.ilike(pattern, escape='\\')
        )

    locations = query.order_by(Location.created_at.desc()).all()

    # Post-filter by feature (requires joining or iterating — we iterate
    # because the feature list per location is always tiny, and it's
    # already eagerly loaded so no extra queries fire here)
    feature_filter = request.args.get('feature')
    result = []
    for loc in locations:
        if feature_filter:
            has_feature = any(
                f.feature_type == feature_filter
                for f in loc.accessibility_features
            )
            if not has_feature:
                continue
        result.append(_serialize_location(loc))

    return jsonify(result), 200


@mobile_api.route('/locations/<int:location_id>', methods=['GET'])
def api_get_location(location_id):
    """Get a single location by ID with full details."""
    from models import Location, Review
    from extensions import db

    # Use query().options() instead of session.get() so we can attach
    # the eager-load options — session.get() does not support .options()
    loc = (
        db.session.query(Location)
        .options(*_location_query_options())
        .filter(Location.id == location_id)
        .first()
    )
    if not loc:
        abort(404)

    return jsonify(_serialize_location(loc)), 200


@mobile_api.route('/locations', methods=['POST'])
@jwt_required()
def api_create_location():
    """
    Create a new location (authenticated users only).

    Accepts either JSON or multipart/form-data (for photo uploads).

    JSON fields:
    {
        "name": str (required),
        "name_ar": str (required),
        "description": str,
        "description_ar": str,
        "category": str (required),
        "latitude": float (required),
        "longitude": float (required),
        "address": str,
        "address_ar": str,
        "accessibility_features": ["wheelchair_ramp", ...],
        "photos_base64": [{"filename": "img.jpg", "data": "base64..."}]
    }
    """
    from models import Location, AccessibilityFeature
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    # Parse body from either JSON or multipart
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
        # Form values come as strings; decode any JSON-encoded fields
        if 'accessibility_features' in data:
            data['accessibility_features'] = _safe_json_loads(
                data['accessibility_features'], default=[]
            )
    else:
        data = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'Request body required'}), 400

    name = (data.get('name') or '').strip()
    name_ar = (data.get('name_ar') or '').strip()
    category = (data.get('category') or '').strip()
    latitude = data.get('latitude')
    longitude = data.get('longitude')

    if not name or not name_ar or not category:
        return jsonify({'error': 'name, name_ar, and category are required'}), 400

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return jsonify({'error': 'Valid latitude and longitude are required'}), 400

    try:
        location = Location(
            name=name,
            name_ar=name_ar,
            description=data.get('description', ''),
            description_ar=data.get('description_ar', ''),
            category=category,
            latitude=latitude,
            longitude=longitude,
            address=data.get('address', ''),
            address_ar=data.get('address_ar', ''),
            user_id=user.id,
            is_verified=False,
        )
        db.session.add(location)
        db.session.flush()  # assign location.id without committing yet

        # Accessibility features
        features_list = data.get('accessibility_features', []) or []
        if isinstance(features_list, str):
            features_list = _safe_json_loads(features_list, default=[])

        for feature_type in features_list:
            if feature_type in VALID_FEATURES:
                db.session.add(AccessibilityFeature(
                    location_id=location.id,
                    feature_type=feature_type,
                    available=True,
                ))

        # Photo uploads (multipart)
        if request.files:
            _save_multipart_photos(request.files.getlist('photos'), location.id)

        # Photo uploads (base64 from JSON)
        _save_base64_photos(data.get('photos_base64', []), location.id)

        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to create location'}), 500

    return jsonify({
        'success': True,
        'message': 'Location added successfully',
        'location': {
            'id':          location.id,
            'name':        location.name,
            'name_ar':     location.name_ar,
            'category':    location.category,
            'is_verified': location.is_verified,
        },
    }), 201


@mobile_api.route('/locations/<int:location_id>', methods=['PUT'])
@jwt_required()
def api_update_location(location_id):
    """Update an existing location (owner or admin only)."""
    from models import Location, AccessibilityFeature
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    location = db.session.get(Location, location_id)
    if not location:
        abort(404)

    if location.user_id != user.id and not user.is_admin:
        return jsonify({'error': 'You do not have permission to edit this location'}), 403

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    try:
        if 'name' in data:           location.name = data['name']
        if 'name_ar' in data:        location.name_ar = data['name_ar']
        if 'description' in data:    location.description = data['description']
        if 'description_ar' in data: location.description_ar = data['description_ar']
        if 'category' in data:       location.category = data['category']
        if 'address' in data:        location.address = data['address']
        if 'address_ar' in data:     location.address_ar = data['address_ar']

        if 'latitude' in data:
            try:
                location.latitude = float(data['latitude'])
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid latitude'}), 400

        if 'longitude' in data:
            try:
                location.longitude = float(data['longitude'])
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid longitude'}), 400

        # Replace accessibility features wholesale
        if 'accessibility_features' in data:
            AccessibilityFeature.query.filter_by(location_id=location.id).delete()
            features_list = data['accessibility_features']
            if isinstance(features_list, str):
                features_list = _safe_json_loads(features_list, default=[])
            if not isinstance(features_list, list):
                features_list = []

            for feature_type in features_list:
                if feature_type in VALID_FEATURES:
                    db.session.add(AccessibilityFeature(
                        location_id=location.id,
                        feature_type=feature_type,
                        available=True,
                    ))

        # Append new photos (existing ones preserved)
        _save_base64_photos(data.get('photos_base64', []), location.id)

        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to update location'}), 500

    return jsonify({
        'success': True,
        'message': 'Location updated successfully',
        'location': {
            'id':          location.id,
            'name':        location.name,
            'name_ar':     location.name_ar,
            'category':    location.category,
            'is_verified': location.is_verified,
        },
    }), 200


@mobile_api.route('/locations/<int:location_id>', methods=['DELETE'])
@jwt_required()
def api_delete_location(location_id):
    """
    Delete a location (owner or admin only).

    Important: we delete the DB row FIRST, then the files. This keeps the
    database authoritative — if file deletion fails the DB is still
    consistent (the row is gone, orphan files are a cleanup job, not a
    correctness issue).
    """
    from models import Location
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    location = db.session.get(Location, location_id)
    if not location:
        abort(404)

    if location.user_id != user.id and not user.is_admin:
        return jsonify({'error': 'You do not have permission to delete this location'}), 403

    # Collect filenames BEFORE deleting the row (so the relationship resolves)
    photo_files = [p.filename for p in location.photos]

    try:
        db.session.delete(location)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete location'}), 500

    # Best-effort file cleanup — errors logged but don't fail the request
    upload_folder = current_app.config['UPLOAD_FOLDER']
    for filename in photo_files:
        filepath = os.path.join(upload_folder, filename)
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
        except OSError as e:
            current_app.logger.warning(
                'Failed to delete photo file %s: %s', filename, e
            )

    return jsonify({'success': True, 'message': 'Location deleted successfully'}), 200


# ═════════════════════════════════════════════
#  REVIEWS ENDPOINTS
# ═════════════════════════════════════════════

@mobile_api.route('/locations/<int:location_id>/reviews', methods=['POST'])
@jwt_required()
def api_add_review(location_id):
    """
    Add a review to a location.

    Request JSON:
    {
        "rating": int (1-5, required),
        "comment": str (optional)
    }
    """
    from models import Location, Review
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    if not db.session.get(Location, location_id):
        abort(404)

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    # Rating validation — accept numeric types but reject booleans.
    # isinstance(True, int) is True in Python, which would otherwise
    # let {"rating": true} through as a 1-star review.
    raw_rating = data.get('rating')
    if isinstance(raw_rating, bool) or raw_rating is None:
        return jsonify({'error': 'Rating must be a number between 1 and 5'}), 400
    try:
        rating = int(raw_rating)
    except (TypeError, ValueError):
        return jsonify({'error': 'Rating must be a number between 1 and 5'}), 400
    if rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be between 1 and 5'}), 400

    try:
        review = Review(
            location_id=location_id,
            user_id=user.id,
            rating=rating,
            comment=data.get('comment', ''),
        )
        db.session.add(review)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to add review'}), 500

    return jsonify({
        'success': True,
        'review': {
            'id':         review.id,
            'user':       user.username,
            'user_id':    user.id,
            'rating':     review.rating,
            'comment':    review.comment,
            'created_at': review.created_at.isoformat() if review.created_at else None,
        },
    }), 201


@mobile_api.route('/reviews/<int:review_id>', methods=['DELETE'])
@jwt_required()
def api_delete_review(review_id):
    """
    Delete a review. Owner can delete their own; admin can delete any
    but must provide a reason (which gets logged).
    """
    from models import Review
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    review = db.session.get(Review, review_id)
    if not review:
        abort(404)

    try:
        if review.user_id == user.id:
            db.session.delete(review)
            db.session.commit()
            return jsonify({'success': True, 'message': 'Review deleted'}), 200

        if user.is_admin:
            data = request.get_json(silent=True) or {}
            reason = data.get('reason')
            if not reason:
                return jsonify({'error': 'Admin must provide a reason for deleting a review'}), 400
            current_app.logger.info(
                'Admin %s deleted review %s. Reason: %s',
                user.username, review_id, reason,
            )
            db.session.delete(review)
            db.session.commit()
            return jsonify({'success': True, 'message': f'Review deleted. Reason: {reason}'}), 200

        return jsonify({'error': 'Permission denied'}), 403
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete review'}), 500


# ═════════════════════════════════════════════
#  REPORTS ENDPOINTS
# ═════════════════════════════════════════════

@mobile_api.route('/locations/<int:location_id>/report', methods=['POST'])
@jwt_required()
def api_report_location(location_id):
    """
    Report a location for issues.

    Request JSON: { "reason": str (required), "description": str (optional) }
    """
    from models import Location, Report
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    if not db.session.get(Location, location_id):
        abort(404)

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    reason = data.get('reason')
    if not reason:
        return jsonify({'error': 'Reason is required'}), 400

    try:
        report = Report(
            location_id=location_id,
            user_id=user.id,
            reason=reason,
            description=data.get('description', ''),
        )
        db.session.add(report)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to submit report: {str(e)}'}), 500

    return jsonify({'success': True, 'message': 'Report submitted'}), 201


# ═════════════════════════════════════════════
#  CHATBOT ENDPOINT
# ═════════════════════════════════════════════

import math
import re


def _haversine_km(lat1, lon1, lat2, lon2):
    """
    Return the great-circle distance in kilometres between two
    (lat, lon) points using the Haversine formula.

    This is pure math — no external libraries needed.
    The formula works by treating the Earth as a sphere (radius ~6371 km),
    projecting both points onto it, and computing the arc between them.
    """
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _name_in_text(name, text):
    """
    Return True if `name` appears in `text` as a meaningful mention.

    Works for both Latin and Arabic scripts. re.escape handles any
    special characters that might appear in location names.
    """
    if not name or not text:
        return False
    pattern = re.compile(re.escape(name.lower()), re.IGNORECASE)
    return bool(pattern.search(text.lower()))


def _build_location_context(user_lat=None, user_lon=None, limit=30):
    """
    Query the database for locations and return a tuple of:
        - text_context:  plain-text lines for the LLM system prompt
        - structured:    list of location dicts for card rendering in the app

    Sorted by distance (closest first) if GPS is provided,
    otherwise sorted by average rating descending.
    """
    from models import Location

    try:
        locations = (
            Location.query
            .options(*_location_query_options())
            .all()
        )
    except Exception:
        return "No location data available at the moment.", []

    if not locations:
        return "There are currently no locations listed in the app.", []

    rows = []
    for loc in locations:
        # ── Average rating ──────────────────────────────────────────
        avg = (
            round(sum(r.rating for r in loc.reviews) / len(loc.reviews), 1)
            if loc.reviews else None
        )
        rating_str = f"{avg}⭐ ({len(loc.reviews)} reviews)" if avg else "no ratings yet"

        # ── Distance ────────────────────────────────────────────────
        dist_str = ""
        dist_km  = None
        if user_lat is not None and user_lon is not None:
            dist_km  = _haversine_km(user_lat, user_lon, loc.latitude, loc.longitude)
            dist_str = f" | {dist_km:.1f} km away"

        # ── Accessibility features (available ones only) ────────────
        available_features = [
            f.feature_type.replace('_', ' ')
            for f in loc.accessibility_features
            if f.available
        ]
        features_str = (
            ', '.join(available_features)
            if available_features
            else 'no accessibility features listed'
        )

        rows.append({
            'text': (
                f"• {loc.name} ({loc.name_ar}) | {loc.category} | "
                f"{loc.address or 'address not listed'} | "
                f"Rating: {rating_str}{dist_str} | "
                f"Verified: {'yes' if loc.is_verified else 'no'} | "
                f"Features: {features_str}"
            ),
            'dist_km': dist_km,
            'avg':     avg or 0,
            'loc':     loc,
        })

    # Sort by distance if GPS available, otherwise by rating
    if user_lat is not None:
        rows.sort(key=lambda r: r['dist_km'] if r['dist_km'] is not None else 9999)
    else:
        rows.sort(key=lambda r: r['avg'], reverse=True)

    top = rows[:limit]

    # ── Plain-text block for the LLM ───────────────────────────────
    text_context = '\n'.join(r['text'] for r in top)

    # ── Structured list for card rendering ─────────────────────────
    structured = []
    for r in top:
        loc = r['loc']
        structured.append({
            'id':           loc.id,
            'name':         loc.name,
            'name_ar':      loc.name_ar,
            'category':     loc.category,
            'address':      loc.address or '',
            'address_ar':   loc.address_ar or '',
            'latitude':     loc.latitude,
            'longitude':    loc.longitude,
            'avg_rating':   round(r['avg'], 1),
            'review_count': len(loc.reviews),
            'is_verified':  loc.is_verified,
            'distance_km':  round(r['dist_km'], 2) if r['dist_km'] is not None else None,
            'features':     [
                f.feature_type
                for f in loc.accessibility_features
                if f.available
            ],
            'photo': loc.photos[0].filename if loc.photos else None,
        })

    return text_context, structured


@mobile_api.route('/chatbot', methods=['POST'])
@jwt_required()
def api_chatbot():
    """
    AI-powered accessibility assistant using Gemma 4 31B via OpenRouter.
    Requires a valid JWT — anonymous access is not permitted.

    The LLM receives a real snapshot of the database plus the current
    user's name and disability context so it can personalise responses.
    GPS coordinates are used silently for distance sorting and are never
    exposed to the model or returned to the client.

    Falls back to keyword matching if the API key is missing or the
    LLM call fails for any reason.

    Request JSON:
    {
        "message":          str   (required),
        "lang":             str   ("en" | "ar", default "en"),
        "lat":              float (optional — user's GPS latitude),
        "lng":              float (optional — user's GPS longitude),
        "location_enabled": bool  (optional — whether location permission is granted)
    }

    Returns:
    {
        "response":    str,
        "suggestions": [str, ...],
        "locations":   [ { id, name, name_ar, category, address, address_ar,
                           latitude, longitude, avg_rating, review_count,
                           is_verified, distance_km, features, photo } ]
    }
    """
    import requests as http_requests

    # ── Auth ──────────────────────────────────────────────────────────
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    message = (data.get('message') or '').strip()
    lang    = data.get('lang', 'en')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    # ── Parse optional GPS coordinates ────────────────────────────────
    # Coordinates are used ONLY for distance calculations and sorting.
    # They are never passed to the LLM or included in any response.
    user_lat         = user_lon = None
    location_enabled = bool(data.get('location_enabled', False))

    try:
        if data.get('lat') is not None and data.get('lng') is not None:
            user_lat = float(data['lat'])
            user_lon = float(data['lng'])
    except (TypeError, ValueError):
        pass  # bad coords → treat as if not provided

    # ── Build location status for the prompt ──────────────────────────
    # Three possible states:
    #   1. Coords received       → distances available, use them silently
    #   2. Enabled but no fix    → permission granted but GPS not ready yet
    #   3. Disabled/denied       → tell user to enable permission if they ask
    if user_lat is not None:
        location_status = (
            "The user has enabled location permissions and their position is known. "
            "Distances to each location have been pre-calculated and are shown in the "
            "location list below. You may reference distances naturally (e.g. 'only 0.3 km away') "
            "but NEVER mention, repeat, or reference the raw coordinates themselves. "
            "If the user asks where they are, look at the FIRST location in the list "
            "(which is the closest one) and infer the user's area from its address field only. "
            "For example if the closest location's address contains 'Irbid', say 'You seem to be near Irbid'. "
            "Do NOT use your own knowledge of Jordan's geography to guess. "
            "Do NOT mention any city or area that does not appear in the closest location's address. "
            "Never state exact coordinates."
        )
    elif location_enabled:
        location_status = (
            "The user has enabled location permissions but a GPS fix has not been "
            "obtained yet. Do not reference any distances or the user's position. "
            "If they ask where they are or for the closest location, let them know "
            "their position is still loading and to try again in a moment."
        )
    else:
        location_status = (
            "The user has NOT enabled location permissions for the JOAccess app. "
            "If they ask anything that requires their location (closest place, distance, "
            "where am I, etc.), tell them directly and clearly that you need location "
            "access to answer that, and ask them to enable location permissions for "
            "JOAccess in their device settings. Do not guess, approximate, or infer "
            "their location under any circumstances."
        )

    # ── Build user context for the prompt ─────────────────────────────
    disability_context = (
        f"The user has indicated the following about their disability or accessibility needs: {user.disability}"
        if user.disability and user.disability.strip()
        else "The user has not specified any disability or accessibility needs — if relevant, ask them what kind of help or features they're looking for."
    )

    api_key = current_app.config.get('OPENROUTER_API_KEY', '')

    # ── LLM path ───────────────────────────────────────────────────────
    if api_key:
        location_context, all_locations_structured = _build_location_context(
            user_lat, user_lon
        )

        has_location = user_lat is not None

        system_prompt = f"""You are the JOAccess Assistant — a friendly, helpful guide built into the JOAccess app, which maps accessible locations across Jordan for people with disabilities.

Your personality: warm, concise, and direct. You answer naturally like a knowledgeable local friend, not like a customer-service bot. Never repeat the same boilerplate line twice in the same conversation. Never say "I'm here to help you find accessible locations" more than once per session.

CURRENT USER:
- Name: {user.username}
- {disability_context}

LOCATION ACCESS STATUS:
{location_status}

IMPORTANT PRIVACY RULES:
- NEVER mention, reveal, or reference raw GPS coordinates (lat/lon numbers) under any circumstances.
- NEVER claim to know anything about the user beyond what is stated in CURRENT USER above.
- If the user asks "what do you know about me?", respond with ONLY their name and their disability/accessibility info as listed above — nothing else.
- Distances you see in the location list are pre-calculated by the server. You may quote them naturally but never explain how they were computed.

Here is the live list of locations currently in the app (sorted {"by distance, closest first" if has_location else "by average rating"}):

{location_context}

Rules you MUST follow:
1. Address the user by name ({user.username}) naturally — not in every message, just where it feels right.
2. When a user asks about locations, ALWAYS reference specific places from the list above by name. Never give a vague "we have locations with X" response when real data exists.
3. When recommending places, mention the name, category, distance (if available), rating, and which relevant accessibility features it has.
4. If the user asks for the closest location, give the top 1–3 from the sorted list.
5. If the user asks about a specific feature (e.g. wheelchair ramp), filter the list and only mention places that actually have it.
6. Tailor your recommendations to the user's disability context when relevant — e.g. if they use a wheelchair, prioritise places with ramps and elevators without being asked.
7. If no locations match what they asked for, say so honestly — don't make things up.
8. Keep responses under 160 words.
9. Respond in Arabic if the user writes in Arabic, English otherwise.
10. At the end of every response include EXACTLY this line with 3–4 follow-up suggestions:
SUGGESTIONS: ["suggestion1", "suggestion2", "suggestion3"]
    Suggestions should be natural follow-up questions or app category names relevant to what was just discussed.
11. Only mention a location by name if you are actively recommending it as a direct answer to what the user asked. Do not name locations as passing side-suggestions unless they genuinely match the request.

Accessibility features you know about: wheelchair ramp, accessible restroom, braille signage, accessible parking, elevator, audio assistance, wide doorways, automatic doors.
Location categories: Restaurants & Cafes, Shopping Malls, Supermarkets, Healthcare, Educational, Government Buildings, Religious Places, Transportation, Tourist Attractions, Beauty & Wellness, Parks, Entertainment, Hotels, Banks & ATMs, Sports & Fitness."""

        try:
            resp = http_requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                    "HTTP-Referer":  "https://joaccess.com",
                    "X-Title":       "JOAccess",
                },
                json={
                    "model":    "google/gemma-4-31b-it",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": message},
                    ],
                    "max_tokens":  400,
                    "temperature": 0.65,
                },
                timeout=20,
            )

            if resp.ok:
                raw_content = resp.json()['choices'][0]['message']['content'].strip()

                suggestions   = []
                response_text = raw_content

                # ── Parse SUGGESTIONS line ───────────────────────────
                if 'SUGGESTIONS:' in raw_content:
                    parts         = raw_content.split('SUGGESTIONS:', 1)
                    response_text = parts[0].strip()
                    try:
                        suggestions = json.loads(parts[1].strip().split('\n')[0])
                        if not isinstance(suggestions, list):
                            suggestions = []
                    except (ValueError, TypeError):
                        suggestions = []

                if not suggestions:
                    suggestions = (
                        ['Restaurants & Cafes', 'Healthcare', 'Shopping Malls', 'Parks']
                        if lang == 'en'
                        else ['مطاعم ومقاهي', 'رعاية صحية', 'مراكز تسوق', 'حدائق']
                    )

                # ── Match locations by scanning the response text ─────
                # Check both English and Arabic names since the model
                # writes location names in whichever language it responds in.
                # _name_in_text does a case-insensitive regex search so
                # partial substring collisions are handled cleanly.
                locations_for_cards = [
                    loc for loc in all_locations_structured
                    if _name_in_text(loc['name'], response_text)
                    or _name_in_text(loc['name_ar'], response_text)
                ]

                return jsonify({
                    'response':    response_text,
                    'suggestions': suggestions[:4],
                    'locations':   locations_for_cards,
                }), 200

            current_app.logger.warning(
                'OpenRouter returned %s: %s', resp.status_code, resp.text[:300]
            )

        except Exception as e:
            current_app.logger.warning('OpenRouter chatbot call failed: %s', e)
        # Fall through to keyword fallback ↓

    # ── Keyword fallback (no API key or LLM call failed) ──────────────
    msg_lower = message.lower()

    keyword_responses_en = {
        'wheelchair': {
            'response':    'I can help you find wheelchair-accessible locations! We have locations with wheelchair ramps, accessible entrances, and elevators across Jordan.',
            'suggestions': ['Restaurants & Cafes', 'Shopping Malls', 'Healthcare', 'Parks'],
            'locations':   [],
        },
        'parking': {
            'response':    'Looking for accessible parking? I can show you locations with designated accessible parking spots.',
            'suggestions': ['Supermarkets', 'Shopping Malls', 'Government Buildings', 'Healthcare'],
            'locations':   [],
        },
        'restroom': {
            'response':    'I can help you find locations with accessible restrooms properly equipped for people with disabilities.',
            'suggestions': ['Restaurants & Cafes', 'Shopping Malls', 'Tourist Attractions', 'Parks'],
            'locations':   [],
        },
        'braille': {
            'response':    'Looking for braille signage? I can show you locations with braille and audio assistance for visually impaired visitors.',
            'suggestions': ['Government Buildings', 'Healthcare', 'Educational', 'Transportation'],
            'locations':   [],
        },
        'elevator': {
            'response':    'I can help you find locations with working elevators for multi-floor accessibility.',
            'suggestions': ['Shopping Malls', 'Healthcare', 'Government Buildings', 'Hotels'],
            'locations':   [],
        },
        'restaurant': {
            'response':    'I can show you accessible restaurants and cafes in Jordan with wheelchair access, accessible restrooms, and wide doorways.',
            'suggestions': ['Restaurants & Cafes', 'Shopping Malls', 'Healthcare', 'Parks'],
            'locations':   [],
        },
        'hospital': {
            'response':    'Looking for accessible healthcare? Jordan has many hospitals and clinics with full accessibility features.',
            'suggestions': ['Healthcare', 'Government Buildings', 'Transportation', 'Parks'],
            'locations':   [],
        },
        'help': {
            'response':    "I'm here to help you find accessible locations in Jordan! Ask me about wheelchair access, parking, restrooms, braille signage, audio assistance, or any type of location.",
            'suggestions': ['Restaurants & Cafes', 'Healthcare', 'Shopping Malls', 'Transportation'],
            'locations':   [],
        },
    }

    keyword_responses_ar = {
        'كرسي': {
            'response':    'يمكنني مساعدتك في إيجاد أماكن يمكن الوصول إليها بكرسي متحرك! لدينا أماكن مع منحدرات ومداخل ومصاعد في جميع أنحاء الأردن.',
            'suggestions': ['مطاعم ومقاهي', 'مراكز تسوق', 'رعاية صحية', 'حدائق'],
            'locations':   [],
        },
        'موقف': {
            'response':    'تبحث عن مواقف سيارات مخصصة؟ يمكنني أن أريك أماكن بها مواقف مخصصة لذوي الإعاقة.',
            'suggestions': ['سوبرماركت', 'مراكز تسوق', 'مباني حكومية', 'رعاية صحية'],
            'locations':   [],
        },
        'دورة مياه': {
            'response':    'يمكنني مساعدتك في إيجاد أماكن بها دورات مياه مجهزة لذوي الإعاقة.',
            'suggestions': ['مطاعم ومقاهي', 'مراكز تسوق', 'مناطق سياحية', 'حدائق'],
            'locations':   [],
        },
        'برايل': {
            'response':    'تبحث عن لافتات برايل؟ يمكنني إظهار الأماكن التي تحتوي على لافتات برايل ومساعدة صوتية.',
            'suggestions': ['مباني حكومية', 'رعاية صحية', 'تعليمية', 'مواصلات'],
            'locations':   [],
        },
        'مصعد': {
            'response':    'يمكنني مساعدتك في إيجاد أماكن بها مصاعد تعمل بشكل جيد.',
            'suggestions': ['مراكز تسوق', 'رعاية صحية', 'مباني حكومية', 'فنادق'],
            'locations':   [],
        },
        'مطعم': {
            'response':    'يمكنني أن أريك مطاعم ومقاهي يمكن الوصول إليها في الأردن مع منحدرات ودورات مياه مجهزة.',
            'suggestions': ['مطاعم ومقاهي', 'مراكز تسوق', 'رعاية صحية', 'حدائق'],
            'locations':   [],
        },
        'مساعدة': {
            'response':    'أنا هنا لمساعدتك في إيجاد أماكن يمكن الوصول إليها في الأردن! اسألني عن الكراسي المتحركة، المواقف، دورات المياه، أو أي نوع من الأماكن.',
            'suggestions': ['مطاعم ومقاهي', 'رعاية صحية', 'مراكز تسوق', 'مواصلات'],
            'locations':   [],
        },
    }

    responses = keyword_responses_ar if lang == 'ar' else keyword_responses_en
    for key, val in responses.items():
        if key in msg_lower:
            return jsonify(val), 200

    if lang == 'ar':
        return jsonify({
            'response':    'أنا هنا لمساعدتك في إيجاد أماكن يمكن الوصول إليها في الأردن. يمكنك أن تسألني عن الكراسي المتحركة، مواقف السيارات، دورات المياه، أو أي نوع من الأماكن.',
            'suggestions': ['كرسي متحرك', 'مواقف مخصصة', 'مطاعم ومقاهي', 'رعاية صحية'],
            'locations':   [],
        }), 200

    return jsonify({
        'response':    "Ask me about wheelchair access, parking, restrooms, or any type of place you're looking for across Jordan.",
        'suggestions': ['Wheelchair access', 'Accessible parking', 'Restaurants & Cafes', 'Healthcare'],
        'locations':   [],
    }), 200


# ═════════════════════════════════════════════
#  ACCESSIBILITY SETTINGS
# ═════════════════════════════════════════════

@mobile_api.route('/accessibility-settings', methods=['GET'])
@jwt_required()
def api_get_accessibility_settings():
    """Get the current user's accessibility settings."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(_safe_json_loads(user.accessibility_settings, default={})), 200


@mobile_api.route('/accessibility-settings', methods=['PUT'])
@jwt_required()
def api_update_accessibility_settings():
    """
    Update accessibility settings.

    Request JSON:
    {
        "highContrast": bool,
        "textSize": int,
        "dyslexiaFont": bool,
        "reducedMotion": bool,
        "colorBlindMode": "none" | "protanopia" | "deuteranopia" | "tritanopia"
    }
    """
    from extensions import db

    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    try:
        # Ensure it's serializable before we commit
        serialized = json.dumps(data)
        user.accessibility_settings = serialized
        db.session.commit()
    except (TypeError, ValueError):
        db.session.rollback()
        return jsonify({'error': 'Settings contain non-JSON-serializable values'}), 400
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to save settings'}), 500

    return jsonify({'success': True, 'settings': data}), 200


# ═════════════════════════════════════════════
#  USER PROFILE LOCATIONS
# ═════════════════════════════════════════════

@mobile_api.route('/my-locations', methods=['GET'])
@jwt_required()
def api_my_locations():
    """Get all locations created by the current user."""
    from models import Location, Review

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    locations = (
        Location.query
        .options(*_location_query_options())
        .filter_by(user_id=user.id)
        .order_by(Location.created_at.desc())
        .all()
    )

    # Use the same serializer the other endpoints use — guarantees field
    # parity between /locations and /my-locations.
    return jsonify([_serialize_location(loc, include_reviews=False) for loc in locations]), 200


# ═════════════════════════════════════════════
#  STATIC FILE HELPER (for photo URLs)
# ═════════════════════════════════════════════

@mobile_api.route('/uploads/<path:filename>', methods=['GET'])
def api_serve_upload(filename):
    """
    Serve uploaded photos. The mobile app constructs image URLs as:
        {BASE_URL}/api/v1/uploads/{filename}
    """
    from flask import send_from_directory

    # Prevent path traversal — only serve filenames that are safe basenames
    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name:
        abort(404)

    return send_from_directory(current_app.config['UPLOAD_FOLDER'], safe_name)
