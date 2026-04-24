"""
admin_blueprint.py
==================
Standalone Flask Blueprint for the JOAccess Admin Panel (Next.js).

Register in app.py by adding these lines after jwt.init_app(app):

    from admin_blueprint import admin_api
    app.register_blueprint(admin_api, url_prefix='/api/admin')

All routes require a valid JWT where the 'is_admin' claim is True.
Tokens are issued by /api/admin/login — NOT by /api/v1/auth/login.

Environment variables needed:
    GOOGLE_AI_API_KEY   — Gemma 4 via Google AI Studio (for AI insights)
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt, get_jwt_identity,
)
from sqlalchemy import func, select, or_, desc
from datetime import datetime, timedelta
from functools import wraps
import json
import os
import requests as http_requests

admin_api = Blueprint("admin_api", __name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_db_models():
    from extensions import db
    from models import User, Location, Review, Report, AccessibilityFeature
    return db, User, Location, Review, Report, AccessibilityFeature


def admin_jwt_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def _current_user_id():
    raw = get_jwt_identity()
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _escape_like(s):
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _paginate_select(db, stmt, page, per_page):
    """Paginate a SQLAlchemy 2.0 select() statement. Returns (items, total, pages)."""
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.session.execute(count_stmt).scalar() or 0
    items = db.session.execute(stmt.offset((page - 1) * per_page).limit(per_page)).scalars().all()
    pages = max(1, (total + per_page - 1) // per_page)
    return items, total, pages


# ── AUTH ─────────────────────────────────────────────────────────────────────

@admin_api.route("/login", methods=["POST"])
def admin_login():
    from extensions import bcrypt
    db, User, *_ = _get_db_models()

    data = request.get_json(silent=True)
    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password are required"}), 400

    user = db.session.execute(
        select(User).where(User.email == data["email"].strip().lower())
    ).scalar_one_or_none()

    if not user or not bcrypt.check_password_hash(user.password, data["password"]):
        return jsonify({"error": "Invalid credentials"}), 401

    if not user.is_admin:
        return jsonify({"error": "This account does not have admin privileges"}), 403

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"is_admin": True},
        expires_delta=timedelta(hours=8),
    )

    return jsonify({
        "access_token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
    }), 200


@admin_api.route("/me", methods=["GET"])
@admin_jwt_required
def admin_me():
    db, User, *_ = _get_db_models()
    user = db.session.get(User, _current_user_id())
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "location_count": len(user.locations),
        "review_count": len(user.reviews),
    }), 200


# ── DASHBOARD STATS ───────────────────────────────────────────────────────────

@admin_api.route("/stats", methods=["GET"])
@admin_jwt_required
def admin_stats():
    db, User, Location, Review, Report, _ = _get_db_models()

    total_users      = db.session.execute(select(func.count(User.id))).scalar() or 0
    total_locations  = db.session.execute(select(func.count(Location.id))).scalar() or 0
    verified_locs    = db.session.execute(
        select(func.count(Location.id)).where(Location.is_verified.is_(True))
    ).scalar() or 0
    unverified_locs  = total_locations - verified_locs
    total_reviews    = db.session.execute(select(func.count(Review.id))).scalar() or 0
    total_reports    = db.session.execute(select(func.count(Report.id))).scalar() or 0

    avg_r = db.session.execute(select(func.avg(Review.rating))).scalar()
    avg_rating = round(float(avg_r), 2) if avg_r else 0.0
    verification_rate = round(verified_locs / total_locations * 100, 1) if total_locations else 0.0

    twelve_months_ago = datetime.utcnow() - timedelta(days=365)

    categories = [
        [r[0], r[1]] for r in db.session.execute(
            select(Location.category, func.count(Location.id).label("c"))
            .group_by(Location.category)
        ).all()
    ]

    monthly_locations = [
        [r[0], r[1]] for r in db.session.execute(
            select(
                func.to_char(Location.created_at, "YYYY-MM").label("m"),
                func.count(Location.id).label("c"),
            )
            .where(Location.created_at >= twelve_months_ago)
            .group_by(func.to_char(Location.created_at, "YYYY-MM"))
            .order_by(func.to_char(Location.created_at, "YYYY-MM"))
        ).all()
    ]

    monthly_users = [
        [r[0], r[1]] for r in db.session.execute(
            select(
                func.to_char(User.created_at, "YYYY-MM").label("m"),
                func.count(User.id).label("c"),
            )
            .where(User.created_at >= twelve_months_ago)
            .group_by(func.to_char(User.created_at, "YYYY-MM"))
            .order_by(func.to_char(User.created_at, "YYYY-MM"))
        ).all()
    ]

    rating_distribution = [
        [f"{r[0]}★", r[1]] for r in db.session.execute(
            select(Review.rating, func.count(Review.id).label("c"))
            .group_by(Review.rating)
            .order_by(Review.rating)
        ).all()
    ]

    top_locs = db.session.execute(
        select(
            Location.name,
            func.count(Review.id).label("rc"),
            func.avg(Review.rating).label("ar"),
        )
        .join(Review, Review.location_id == Location.id, isouter=True)
        .group_by(Location.id, Location.name)
        .order_by(desc(func.count(Review.id)))
        .limit(10)
    ).all()
    top_locations = [
        {"name": r[0], "review_count": r[1] or 0, "avg_rating": round(float(r[2]), 1) if r[2] else 0.0}
        for r in top_locs
    ]

    recent_locs = db.session.execute(
        select(Location).order_by(desc(Location.created_at)).limit(8)
    ).scalars().all()
    recent_locations = [
        {
            "id": loc.id, "name": loc.name, "category": loc.category,
            "is_verified": loc.is_verified,
            "avg_rating": round(sum(r.rating for r in loc.reviews) / len(loc.reviews), 1) if loc.reviews else 0.0,
            "review_count": len(loc.reviews),
            "creator": loc.creator.username if loc.creator else None,
            "creator_type": loc.creator.user_type if loc.creator else None,
            "created_at": loc.created_at.isoformat() if loc.created_at else None,
        }
        for loc in recent_locs
    ]

    recent_revs = db.session.execute(
        select(Review).order_by(desc(Review.created_at)).limit(8)
    ).scalars().all()
    recent_reviews = [
        {
            "id": r.id, "location_id": r.location_id,
            "location_name": r.location.name if r.location else "Unknown",
            "user": r.author.username if r.author else "Unknown",
            "user_id": r.user_id, "rating": r.rating, "comment": r.comment,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent_revs
    ]

    return jsonify({
        "total_users": total_users, "total_locations": total_locations,
        "verified_locations": verified_locs, "unverified_locations": unverified_locs,
        "total_reviews": total_reviews, "total_reports": total_reports,
        "avg_rating": avg_rating, "verification_rate": verification_rate,
        "categories": categories, "monthly_locations": monthly_locations,
        "monthly_users": monthly_users, "rating_distribution": rating_distribution,
        "top_locations": top_locations, "recent_locations": recent_locations,
        "recent_reviews": recent_reviews,
    }), 200


# ── LOCATIONS ─────────────────────────────────────────────────────────────────

@admin_api.route("/locations", methods=["GET"])
@admin_jwt_required
def admin_get_locations():
    db, _, Location, *__ = _get_db_models()

    page       = max(1, int(request.args.get("page", 1)))
    per_page   = min(50, max(1, int(request.args.get("per_page", 15))))
    search     = request.args.get("search", "").strip()
    category   = request.args.get("category", "").strip()
    verified_p = request.args.get("verified", "")

    stmt = select(Location)
    if search:
        p = f"%{_escape_like(search)}%"
        stmt = stmt.where(or_(
            Location.name.ilike(p, escape="\\"),
            Location.name_ar.ilike(p, escape="\\"),
            Location.address.ilike(p, escape="\\"),
        ))
    if category:
        stmt = stmt.where(Location.category == category)
    if verified_p == "true":
        stmt = stmt.where(Location.is_verified.is_(True))
    elif verified_p == "false":
        stmt = stmt.where(Location.is_verified.is_(False))

    stmt = stmt.order_by(desc(Location.created_at))
    locations, total, pages = _paginate_select(db, stmt, page, per_page)

    return jsonify({
        "locations": [
            {
                "id": loc.id, "name": loc.name, "name_ar": loc.name_ar,
                "category": loc.category, "address": loc.address,
                "latitude": loc.latitude, "longitude": loc.longitude,
                "is_verified": loc.is_verified,
                "verified_at": loc.verified_at.isoformat() if loc.verified_at else None,
                "avg_rating": round(sum(r.rating for r in loc.reviews) / len(loc.reviews), 1) if loc.reviews else 0.0,
                "review_count": len(loc.reviews),
                "creator": loc.creator.username if loc.creator else None,
                "creator_type": loc.creator.user_type if loc.creator else None,
                "photos": [p.filename for p in loc.photos],
                "accessibility_features": [
                    {"type": f.feature_type, "available": f.available, "notes": f.notes}
                    for f in loc.accessibility_features
                ],
                "created_at": loc.created_at.isoformat() if loc.created_at else None,
            }
            for loc in locations
        ],
        "total": total, "pages": pages, "page": page,
    }), 200


@admin_api.route("/locations/<int:location_id>/verify", methods=["POST"])
@admin_jwt_required
def admin_verify_location(location_id):
    db, _, Location, *__ = _get_db_models()
    loc = db.session.get(Location, location_id)
    if not loc:
        return jsonify({"error": "Location not found"}), 404
    loc.is_verified = True
    loc.verified_by = _current_user_id()
    loc.verified_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"success": True}), 200


@admin_api.route("/locations/<int:location_id>/unverify", methods=["POST"])
@admin_jwt_required
def admin_unverify_location(location_id):
    db, _, Location, *__ = _get_db_models()
    loc = db.session.get(Location, location_id)
    if not loc:
        return jsonify({"error": "Location not found"}), 404
    loc.is_verified = False
    loc.verified_by = None
    loc.verified_at = None
    db.session.commit()
    return jsonify({"success": True}), 200


@admin_api.route("/locations/<int:location_id>", methods=["DELETE"])
@admin_jwt_required
def admin_delete_location(location_id):
    db, _, Location, *__ = _get_db_models()
    loc = db.session.get(Location, location_id)
    if not loc:
        return jsonify({"error": "Location not found"}), 404
    upload_folder = current_app.config.get("UPLOAD_FOLDER", "static/uploads")
    for photo in loc.photos:
        try:
            path = os.path.join(upload_folder, photo.filename)
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    db.session.delete(loc)
    db.session.commit()
    return jsonify({"success": True}), 200


# ── USERS ─────────────────────────────────────────────────────────────────────

@admin_api.route("/users", methods=["GET"])
@admin_jwt_required
def admin_get_users():
    db, User, *_ = _get_db_models()

    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 15))))
    search   = request.args.get("search", "").strip()

    stmt = select(User)
    if search:
        p = f"%{_escape_like(search)}%"
        stmt = stmt.where(or_(
            User.username.ilike(p, escape="\\"),
            User.email.ilike(p, escape="\\"),
        ))
    stmt = stmt.order_by(desc(User.created_at))
    users, total, pages = _paginate_select(db, stmt, page, per_page)

    return jsonify({
        "users": [
            {
                "id": u.id, "username": u.username, "email": u.email,
                "user_type": u.user_type, "org_name": u.org_name,
                "disability": u.disability, "is_admin": u.is_admin,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "location_count": len(u.locations),
                "review_count": len(u.reviews),
            }
            for u in users
        ],
        "total": total, "pages": pages, "page": page,
    }), 200


@admin_api.route("/users/<int:user_id>", methods=["DELETE"])
@admin_jwt_required
def admin_delete_user(user_id):
    db, User, *_ = _get_db_models()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.is_admin:
        return jsonify({"error": "Admin accounts cannot be deleted via the panel"}), 403
    db.session.delete(user)
    db.session.commit()
    return jsonify({"success": True}), 200


# ── REVIEWS ───────────────────────────────────────────────────────────────────

@admin_api.route("/reviews", methods=["GET"])
@admin_jwt_required
def admin_get_reviews():
    db, _, __, Review, *_ = _get_db_models()

    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 15))))

    stmt = select(Review).order_by(desc(Review.created_at))
    reviews, total, pages = _paginate_select(db, stmt, page, per_page)

    return jsonify({
        "reviews": [
            {
                "id": r.id, "location_id": r.location_id,
                "location_name": r.location.name if r.location else "Unknown",
                "user": r.author.username if r.author else "Unknown",
                "user_id": r.user_id, "rating": r.rating, "comment": r.comment,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reviews
        ],
        "total": total, "pages": pages, "page": page,
    }), 200


@admin_api.route("/reviews/<int:review_id>", methods=["DELETE"])
@admin_jwt_required
def admin_delete_review(review_id):
    db, _, __, Review, *_ = _get_db_models()
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"error": "Review not found"}), 404
    db.session.delete(review)
    db.session.commit()
    return jsonify({"success": True}), 200


# ── REPORTS ───────────────────────────────────────────────────────────────────

@admin_api.route("/reports", methods=["GET"])
@admin_jwt_required
def admin_get_reports():
    db, _, __, ___, Report, *_ = _get_db_models()

    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 15))))

    stmt = select(Report).order_by(desc(Report.created_at))
    reports, total, pages = _paginate_select(db, stmt, page, per_page)

    return jsonify({
        "reports": [
            {
                "id": r.id, "location_id": r.location_id,
                "location_name": r.location.name if r.location else "Unknown",
                "reporter": r.user.username if r.user else "Unknown",
                "reporter_id": r.user_id, "reason": r.reason,
                "description": r.description,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                # Real resolution tracking — was previously a "[RESOLVED] " string prefix hack.
                "resolved": r.resolved_at is not None,
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                "resolved_by": r.resolved_by,
            }
            for r in reports
        ],
        "total": total, "pages": pages, "page": page,
    }), 200


@admin_api.route("/reports/<int:report_id>/resolve", methods=["POST"])
@admin_jwt_required
def admin_resolve_report(report_id):
    db, _, __, ___, Report, *_ = _get_db_models()
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({"error": "Report not found"}), 404
    # Only stamp the first time so re-POSTs are idempotent and we don't
    # overwrite who originally resolved it.
    if report.resolved_at is None:
        report.resolved_at = datetime.utcnow()
        report.resolved_by = _current_user_id()
        db.session.commit()
    return jsonify({"success": True}), 200


@admin_api.route("/reports/<int:report_id>", methods=["DELETE"])
@admin_jwt_required
def admin_delete_report(report_id):
    db, _, __, ___, Report, *_ = _get_db_models()
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({"error": "Report not found"}), 404
    db.session.delete(report)
    db.session.commit()
    return jsonify({"success": True}), 200


# ── AI INSIGHTS ───────────────────────────────────────────────────────────────

@admin_api.route("/ai-insights", methods=["POST"])
@admin_jwt_required
def admin_ai_insights():
    db, User, Location, Review, Report, _ = _get_db_models()

    # Read from app config (populated from env via config.py), not os.environ
    # directly — keeps all env-var reads in one place.
    api_key = current_app.config.get("OPENROUTER_API_KEY")
    if not api_key:
        return jsonify({"error": "OPENROUTER_API_KEY is not set on the server."}), 503

    total_users     = db.session.execute(select(func.count(User.id))).scalar() or 0
    total_locations = db.session.execute(select(func.count(Location.id))).scalar() or 0
    verified        = db.session.execute(
        select(func.count(Location.id)).where(Location.is_verified.is_(True))
    ).scalar() or 0
    total_reviews   = db.session.execute(select(func.count(Review.id))).scalar() or 0
    total_reports   = db.session.execute(select(func.count(Report.id))).scalar() or 0
    avg_r           = db.session.execute(select(func.avg(Review.rating))).scalar()
    avg_rating      = round(float(avg_r), 2) if avg_r else 0.0

    cats = db.session.execute(
        select(Location.category, func.count(Location.id)).group_by(Location.category)
    ).all()
    utypes = db.session.execute(
        select(User.user_type, func.count(User.id)).group_by(User.user_type)
    ).all()
    reasons = db.session.execute(
        select(Report.reason, func.count(Report.id)).group_by(Report.reason)
    ).all()

    stats_summary = f"""
JOAccess Platform Statistics:
- Users: {total_users} ({", ".join(f"{r[0]}: {r[1]}" for r in utypes)})
- Locations: {total_locations} ({verified} verified, {total_locations - verified} pending)
- Verification rate: {round(verified / total_locations * 100, 1) if total_locations else 0}%
- Reviews: {total_reviews} | Avg rating: {avg_rating}/5.0
- Reports: {total_reports} ({", ".join(f"{r[0]}: {r[1]}" for r in reasons) or "none"})
- Categories: {", ".join(f"{r[0]}: {r[1]}" for r in cats)}
""".strip()

    system_prompt = (
        "You are an expert data analyst for JOAccess, a community-driven accessibility "
        "mapping platform for Jordan. Analyze the platform statistics and give the admin team "
        "practical, actionable insights. Be concise. "
        'End your response with exactly this JSON block: {"recommendations": ["...", "...", "...", "...", "..."]} '
        "containing 5 specific recommendations."
    )

    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        # Gemma 4 on OpenRouter — free tier, no rate-limit surprises.
        "model": "google/gemma-4-31b-it",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": stats_summary},
        ],
        "temperature": 0.7,
        "max_tokens": 1500,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # OpenRouter recommends sending these so they can track usage by app.
        "HTTP-Referer": "https://joaccess-admin.netlify.app",
        "X-Title": "JOAccess Admin Panel",
    }

    try:
        resp = http_requests.post(url, json=payload, headers=headers, timeout=45)
        resp.raise_for_status()
        full_text = resp.json()["choices"][0]["message"]["content"]
    except http_requests.exceptions.Timeout:
        return jsonify({"error": "AI service timed out. Please try again."}), 504
    except (http_requests.exceptions.RequestException, KeyError, IndexError) as e:
        return jsonify({"error": f"AI service error: {str(e)}"}), 502

    recommendations = []
    insights_text = full_text
    json_start = full_text.rfind('{"recommendations"')
    if json_start != -1:
        insights_text = full_text[:json_start].strip()
        try:
            recommendations = json.loads(full_text[json_start:]).get("recommendations", [])
        except (json.JSONDecodeError, AttributeError):
            pass

    return jsonify({
        "insights": insights_text,
        "recommendations": recommendations,
        "generated_at": datetime.utcnow().isoformat(),
        "model": "google/gemma-4-31b-it",
    }), 200
