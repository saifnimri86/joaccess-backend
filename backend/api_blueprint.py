"""
JOAccess Mobile API Blueprint (corrected)
==========================================
Drop this file into your Flask project root (same level as app.py).
Then in app.py, add these two lines after jwt.init_app(app):

    from api_blueprint import mobile_api
    app.register_blueprint(mobile_api, url_prefix='/api/v1')

All existing web routes remain untouched. The mobile app talks exclusively
to /api/v1/* endpoints with JWT Bearer tokens for authentication.

Fixes in this revision (vs. the original Phase 1 file):
-------------------------------------------------------
 1. JWT identity is now always a string (flask-jwt-extended 4.6+ requires this).
    get_jwt_identity() is wrapped so callers still receive an int.
 2. SQLAlchemy Query.get() / get_or_404() replaced with db.session.get() +
    explicit abort(404) — SQLAlchemy 2.0 compliance.
 3. New /health endpoint for the mobile app's network probe.
 4. json.loads() on stored JSON columns is wrapped in try/except so a
    malformed DB value can't 500 the login endpoint.
 5. ILIKE wildcard characters in user input are escaped so ?category=%
    doesn't return the entire table.
 6. Rating validation accepts int-like values and rejects booleans.
 7. Photo uploads capped at 5MB each and 10 per request.
 8. Uploaded filenames include a UUID slice so simultaneous uploads
    never collide on disk.
 9. Delete-location now deletes DB rows first, then removes files; file
    errors no longer leave orphaned DB state.
10. Server-side timestamps use datetime.utcnow() for stable filenames
    regardless of server timezone.
11. accessibility_settings update wrapped in try/except so unserializable
    data can't poison the session.
12. /my-locations now returns creator/creator_type for API symmetry.
13. Chatbot keyword matching stays (Phase 2 replaces it with the LLM).
14. All json.loads() calls on request-side data are wrapped defensively.
15. Circular import eliminated — all models imported from models.py,
    db/jwt/bcrypt imported from extensions.py, never from app.py.

Plus: consistent use of db.session.rollback() in broad except blocks to
prevent hanging transactions.
"""

from flask import Blueprint, request, jsonify, current_app, abort
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from extensions import db, jwt, bcrypt
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
from functools import wraps
import os
import json
import base64
import uuid
import requests

mobile_api = Blueprint('mobile_api', __name__)


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


def _serialize_location(loc, include_reviews=True):
    """
    Consistent dict representation of a Location for API responses.
    Centralized here so /locations, /locations/:id, /my-locations all
    return the same field set.
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


def _upload_to_supabase(img_bytes: bytes, filename: str) -> str | None:
    """
    Upload raw image bytes to Supabase Storage and return the public URL.
    Returns None if the upload fails for any reason.

    How it works:
        - We call Supabase's REST Storage API directly with an HTTP PUT request.
        - The path inside the bucket is just the filename (flat structure, no folders).
        - The service role key bypasses RLS so the server can always write.
        - On success Supabase returns 200 and the public URL is deterministic:
          <SUPABASE_URL>/storage/v1/object/public/location-photos/<filename>
    """
    supabase_url = current_app.config.get("SUPABASE_URL", "").rstrip("/")
    service_key  = current_app.config.get("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not service_key:
        current_app.logger.error("Supabase Storage not configured — missing env vars.")
        return None

    bucket      = "location-photos"
    upload_url  = f"{supabase_url}/storage/v1/object/{bucket}/{filename}"

    headers = {
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "image/jpeg",   # Supabase uses this for storage; still works for PNG
        "x-upsert":      "true",         # overwrite if the same filename already exists
    }

    try:
        resp = requests.put(upload_url, data=img_bytes, headers=headers, timeout=30)
        if resp.status_code in (200, 201):
            # Public URL is deterministic — no need to parse the response body
            public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{filename}"
            return public_url
        else:
            current_app.logger.error(
                "Supabase Storage upload failed: %s %s", resp.status_code, resp.text
            )
            return None
    except requests.RequestException as e:
        current_app.logger.error("Supabase Storage request error: %s", e)
        return None


def _save_base64_photos(photos_raw, location_id):
    """
    Decode base64 photos from the request payload and upload them to
    Supabase Storage. Stores the returned public URL in the Photo row.

    Accepts either a list of dicts or a JSON string (multipart sends it
    as a string field). Each dict must have 'data' (base64) and 'filename'.
    """
    from models import Photo

    if isinstance(photos_raw, str):
        photos_raw = _safe_json_loads(photos_raw, default=[])
    if not isinstance(photos_raw, list):
        return 0

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
            continue

        if len(img_bytes) > MAX_PHOTO_BYTES:
            continue

        filename  = _generate_unique_filename(photo_data['filename'])
        public_url = _upload_to_supabase(img_bytes, filename)
        if not public_url:
            continue  # upload failed, skip this photo

        db.session.add(Photo(location_id=location_id, filename=public_url))
        saved += 1

    return saved


def _save_multipart_photos(files_list, location_id):
    """
    Read photo files from a multipart/form-data request and upload them
    to Supabase Storage. Stores the returned public URL in the Photo row.
    """
    from models import Photo

    saved = 0
    files_list = files_list[:MAX_PHOTOS_PER_LOCATION]

    for file in files_list:
        if not file or not file.filename:
            continue

        # Size check — seek to end to measure, then rewind
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > MAX_PHOTO_BYTES:
            continue

        img_bytes  = file.read()
        filename   = _generate_unique_filename(file.filename)
        public_url = _upload_to_supabase(img_bytes, filename)
        if not public_url:
            continue

        db.session.add(Photo(location_id=location_id, filename=public_url))
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

    # Admin allow-list lives in Flask config (loaded from env via config.py).
    # Reading it through current_app avoids a circular import from app.py.
    admin_emails = current_app.config.get("ADMIN_EMAILS", [])

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

    is_admin = email in admin_emails
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
    Get locations with optional filtering.

    Query params:
        category (string): Filter by category name (substring match)
        feature  (string): Filter to locations with this accessibility feature
        verified (bool):   Filter verified only (true/false)
        search   (string): Search by name/name_ar/address
        limit    (int):    Max locations to return (default 200, max 500)

    Returns:
        200: [ { ...location dict... } ]
    """
    from models import Location

    # Eager-load all relationships in a single query using SELECT IN strategy.
    # Without this, SQLAlchemy fires one extra query per relationship per
    # location (N+1), which means ~640 round-trips to Supabase for 160 locations.
    # selectinload fires 1 extra query per relationship total — 4 queries instead of 640.
    query = Location.query.options(
        selectinload(Location.accessibility_features),
        selectinload(Location.photos),
        selectinload(Location.reviews),
        selectinload(Location.creator),
    )

    category = request.args.get('category')
    if category:
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

    # Respect limit param — default 200, hard cap 500 so nobody can dump the whole DB.
    try:
        limit = min(500, max(1, int(request.args.get('limit', 200))))
    except (TypeError, ValueError):
        limit = 200

    locations = query.order_by(Location.created_at.desc()).limit(limit).all()

    feature_filter = request.args.get('feature')
    result = []
    for loc in locations:
        if feature_filter:
            if not any(f.feature_type == feature_filter for f in loc.accessibility_features):
                continue
        result.append(_serialize_location(loc))

    return jsonify(result), 200


@mobile_api.route('/locations/<int:location_id>', methods=['GET'])
def api_get_location(location_id):
    """Get a single location by ID with full details."""
    from models import Location

    loc = db.session.get(Location, location_id, options=[
        selectinload(Location.accessibility_features),
        selectinload(Location.photos),
        selectinload(Location.reviews),
        selectinload(Location.creator),
    ])
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

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
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

        if request.files:
            _save_multipart_photos(request.files.getlist('photos'), location.id)

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

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    location = db.session.get(Location, location_id)
    if not location:
        abort(404)

    if location.user_id != user.id and not user.is_admin:
        return jsonify({'error': 'You do not have permission to delete this location'}), 403

    photo_files = [p.filename for p in location.photos]

    try:
        db.session.delete(location)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete location'}), 500

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

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    if not db.session.get(Location, location_id):
        abort(404)

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

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
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to submit report'}), 500

    return jsonify({'success': True, 'message': 'Report submitted'}), 201


# ═════════════════════════════════════════════
#  CHATBOT ENDPOINT
# ═════════════════════════════════════════════

@mobile_api.route('/chatbot', methods=['POST'])
def api_chatbot():
    """
    Keyword-matching chatbot (Phase 2 replaces this with the LLM).

    Request JSON: { "message": str (required), "lang": "en" | "ar" }
    Returns:     { "response": str, "suggestions": [str, ...] }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    message = (data.get('message') or '').lower().strip()
    lang = data.get('lang', 'en')

    responses_en = {
        'wheelchair': {
            'response': 'I can help you find wheelchair-accessible locations! We have locations with wheelchair ramps, accessible entrances, and elevators. Would you like me to show you restaurants, malls, or other specific types of locations?',
            'suggestions': ['Restaurants', 'Shopping Malls', 'Healthcare', 'Parks'],
        },
        'parking': {
            'response': 'Looking for accessible parking? I can show you locations that have designated accessible parking spots. What type of place are you looking for?',
            'suggestions': ['Supermarkets', 'Shopping Malls', 'Government Buildings', 'Healthcare'],
        },
        'restroom': {
            'response': 'I can help you find locations with accessible restrooms. These locations have properly equipped facilities for people with disabilities. What category interests you?',
            'suggestions': ['Restaurants & Cafes', 'Shopping Malls', 'Tourist Attractions', 'Parks'],
        },
        'visual': {
            'response': 'For visual impairments, I recommend locations with braille signage and audio assistance. Would you like to see places in any specific category?',
            'suggestions': ['Government Buildings', 'Healthcare', 'Educational', 'Transportation'],
        },
        'restaurant': {
            'response': 'Great choice! I can show you accessible restaurants and cafes in Jordan. Many have wheelchair access, accessible restrooms, and wide doorways. Would you like to see them on the map?',
            'suggestions': ['Show on map', 'Filter by area', 'See reviews'],
        },
        'help': {
            'response': "I'm here to help you find accessible locations in Jordan! You can ask me about:\n• Wheelchair accessibility\n• Accessible parking\n• Restrooms\n• Braille signage\n• Audio assistance\n• Or any specific type of location",
            'suggestions': ['Restaurants', 'Healthcare', 'Shopping', 'Transportation'],
        },
    }

    responses_ar = {
        'كرسي': {
            'response': 'يمكنني مساعدتك في إيجاد أماكن يمكن الوصول إليها بكرسي متحرك! لدينا أماكن مع منحدرات ومداخل ومصاعد. هل تريد أن أريك مطاعم أو مراكز تسوق أو أنواع أخرى من الأماكن؟',
            'suggestions': ['مطاعم ومقاهي', 'مراكز تسوق', 'رعاية صحية', 'حدائق'],
        },
        'موقف': {
            'response': 'تبحث عن مواقف سيارات مخصصة؟ يمكنني أن أريك أماكن بها مواقف مخصصة لذوي الإعاقة. ما نوع المكان الذي تبحث عنه؟',
            'suggestions': ['سوبرماركت', 'مراكز تسوق', 'مباني حكومية', 'رعاية صحية'],
        },
        'دورة مياه': {
            'response': 'يمكنني مساعدتك في إيجاد أماكن بها دورات مياه مجهزة. هذه الأماكن لديها مرافق مناسبة لذوي الإعاقة. أي فئة تهمك؟',
            'suggestions': ['مطاعم ومقاهي', 'مراكز تسوق', 'مناطق سياحية', 'حدائق'],
        },
        'بصر': {
            'response': 'بالنسبة للإعاقات البصرية، أنصح بأماكن بها لافتات بطريقة برايل ومساعدة صوتية. هل تريد رؤية أماكن في فئة معينة؟',
            'suggestions': ['مباني حكومية', 'رعاية صحية', 'تعليمية', 'مواصلات'],
        },
        'مطعم': {
            'response': 'اختيار رائع! يمكنني أن أريك مطاعم ومقاهي يمكن الوصول إليها في الأردن. كثير منها لديه منحدرات ودورات مياه مجهزة وأبواب واسعة. هل تريد رؤيتها على الخريطة؟',
            'suggestions': ['عرض على الخريطة', 'تصفية حسب المنطقة', 'مشاهدة التقييمات'],
        },
        'مساعدة': {
            'response': 'أنا هنا لمساعدتك في إيجاد أماكن يمكن الوصول إليها في الأردن! يمكنك أن تسألني عن:\n• إمكانية الوصول بكرسي متحرك\n• مواقف السيارات المخصصة\n• دورات المياه\n• لافتات برايل\n• المساعدة الصوتية\n• أو أي نوع محدد من الأماكن',
            'suggestions': ['مطاعم', 'رعاية صحية', 'تسوق', 'مواصلات'],
        },
    }

    responses = responses_ar if lang == 'ar' else responses_en

    for key in responses.keys():
        if key in message:
            return jsonify(responses[key]), 200

    default_response = {
        'en': {
            'response': "I'm here to help you find accessible locations in Jordan. You can ask me about wheelchair accessibility, parking, restrooms, or specific types of locations like restaurants, malls, or healthcare facilities. How can I assist you?",
            'suggestions': ['Wheelchair access', 'Accessible parking', 'Restaurants', 'Healthcare'],
        },
        'ar': {
            'response': 'أنا هنا لمساعدتك في إيجاد أماكن يمكن الوصول إليها في الأردن. يمكنك أن تسألني عن إمكانية الوصول بكرسي متحرك، مواقف السيارات، دورات المياه، أو أنواع محددة من الأماكن مثل المطاعم أو المراكز الصحية. كيف يمكنني مساعدتك؟',
            'suggestions': ['كرسي متحرك', 'مواقف مخصصة', 'مطاعم', 'رعاية صحية'],
        },
    }
    return jsonify(default_response.get(lang, default_response['en'])), 200


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
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    try:
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
    from models import Location

    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    locations = (Location.query
                 .filter_by(user_id=user.id)
                 .order_by(Location.created_at.desc())
                 .all())

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

    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name:
        abort(404)

    return send_from_directory(current_app.config['UPLOAD_FOLDER'], safe_name)
