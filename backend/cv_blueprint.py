"""
cv_blueprint.py
================
Computer-vision verification endpoints for the JOAccess admin panel.

This blueprint does NOT run the model itself. PyTorch + EfficientNet-B0
would push Render's free 512 MB RAM tier over the edge, so the model
lives in a separate Hugging Face Space (FastAPI + 16 GB RAM, free).
This blueprint just acts as an authenticated proxy:

    Admin panel  ──>  /api/admin/locations/<id>/analyze
                              │
                              ▼
                       (this blueprint)
                              │  X-CV-Secret header
                              ▼
                  Hugging Face Space /predict
                              │
                              ▼
                     EfficientNet-B0 inference

Why proxy instead of calling the Space directly from the admin panel:
    1. The shared secret stays server-side — never exposed to the browser.
    2. JWT admin auth is enforced before any compute is spent.
    3. We can cache, rate-limit, or persist results later without touching
       the frontend.

Register in app.py:
    from cv_blueprint import cv_api
    app.register_blueprint(cv_api, url_prefix="/api/admin")

Required env vars:
    CV_SERVICE_URL    — base URL of the HF Space, e.g. https://saif-joaccess.hf.space
    CV_SHARED_SECRET  — must match the one set in the Space's Secrets tab
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from functools import wraps

import requests as http_requests
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import select

cv_api = Blueprint("cv_api", __name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_db_models():
    """
    Local-import helper used everywhere in this codebase to avoid the
    circular-import dance with extensions.py / models.py.
    """
    from extensions import db
    from models import Location, Photo
    return db, Location, Photo


def admin_jwt_required(fn):
    """
    Same admin-auth decorator pattern used in admin_blueprint.py — a JWT
    is required AND the is_admin claim must be True. Kept inline here so
    this blueprint stays self-contained.
    """
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def _classify_one_photo(photo_url: str, service_url: str, secret: str, timeout: int = 30) -> dict:
    """
    Send a single photo URL to the HF Space and return a normalized result dict.

    On any failure (timeout, network error, 5xx from the Space, etc.) we
    return a result with `success: False` and an error message rather than
    raising — that way one bad photo doesn't tank the whole batch response.
    """
    try:
        resp = http_requests.post(
            f"{service_url.rstrip('/')}/predict",
            json={"image_url": photo_url},
            headers={"X-CV-Secret": secret} if secret else {},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "photo_url": photo_url,
            "success": True,
            "predicted_class": data.get("predicted_class"),
            "confidence": data.get("confidence"),
            "all_scores": data.get("all_scores", {}),
            "inference_ms": data.get("inference_ms"),
        }
    except http_requests.exceptions.Timeout:
        return {
            "photo_url": photo_url,
            "success": False,
            "error": "CV service timed out",
        }
    except http_requests.exceptions.HTTPError as e:
        # Try to surface the real error message from the Space for easier debugging
        detail = ""
        try:
            detail = e.response.json().get("detail", "")
        except Exception:
            detail = e.response.text[:200] if e.response is not None else ""
        return {
            "photo_url": photo_url,
            "success": False,
            "error": f"CV service returned {e.response.status_code if e.response else '?'}: {detail}",
        }
    except http_requests.exceptions.RequestException as e:
        return {
            "photo_url": photo_url,
            "success": False,
            "error": f"CV service unreachable: {e}",
        }
    except (ValueError, KeyError) as e:
        return {
            "photo_url": photo_url,
            "success": False,
            "error": f"Malformed CV service response: {e}",
        }


# ── ROUTES ───────────────────────────────────────────────────────────────────

@cv_api.route("/cv/health", methods=["GET"])
@admin_jwt_required
def cv_health():
    """
    Probe the HF Space to confirm it's reachable and the secret works.
    Useful for the admin panel to show "CV service: online/offline" indicator.
    """
    service_url = current_app.config.get("CV_SERVICE_URL", "")
    secret = current_app.config.get("CV_SHARED_SECRET", "")

    if not service_url:
        return jsonify({
            "ok": False,
            "error": "CV_SERVICE_URL is not set on the server.",
        }), 503

    try:
        resp = http_requests.get(
            f"{service_url.rstrip('/')}/health",
            headers={"X-CV-Secret": secret} if secret else {},
            timeout=10,
        )
        resp.raise_for_status()
        return jsonify({"ok": True, "service": resp.json()}), 200
    except http_requests.exceptions.RequestException as e:
        return jsonify({"ok": False, "error": str(e)}), 502


@cv_api.route("/locations/<int:location_id>/analyze", methods=["POST"])
@admin_jwt_required
def analyze_location_photos(location_id: int):
    """
    Run computer-vision analysis on all photos belonging to a location.

    For each photo, the Hugging Face Space returns the predicted accessibility
    feature class plus per-class confidence scores. The admin can use this to:
        - confirm a photo actually shows what the user claims
        - spot mismatches between a location's claimed features and what
          its photos actually depict
        - reject locations with photos that don't match any class

    Response shape:
        {
            "location_id": 42,
            "location_name": "Mecca Mall",
            "claimed_features": ["wheelchair_ramp", "elevator"],
            "results": [
                {
                    "photo_url": "https://...",
                    "success": true,
                    "predicted_class": "wheelchair_ramp",
                    "confidence": 96.59,
                    "all_scores": { ... },
                    "inference_ms": 142
                },
                ...
            ],
            "summary": {
                "total_photos": 5,
                "successful": 5,
                "failed": 0,
                "feature_match_count": 4,   // photos whose top class matches a claimed feature
                "feature_mismatch_count": 1
            },
            "analyzed_at": "2026-05-10T..."
        }
    """
    db, Location, Photo = _get_db_models()

    service_url = current_app.config.get("CV_SERVICE_URL", "")
    secret = current_app.config.get("CV_SHARED_SECRET", "")
    if not service_url:
        return jsonify({"error": "CV_SERVICE_URL is not set on the server."}), 503

    # Look up the location with its photos and accessibility features
    location = db.session.get(Location, location_id)
    if not location:
        return jsonify({"error": "Location not found"}), 404

    photo_urls = [p.filename for p in location.photos]
    if not photo_urls:
        return jsonify({
            "location_id": location.id,
            "location_name": location.name,
            "claimed_features": [f.feature_type for f in location.accessibility_features if f.available],
            "results": [],
            "summary": {
                "total_photos": 0,
                "successful": 0,
                "failed": 0,
                "feature_match_count": 0,
                "feature_mismatch_count": 0,
            },
            "analyzed_at": datetime.utcnow().isoformat(),
            "message": "This location has no photos to analyze.",
        }), 200

    # Run all photo classifications in parallel using a thread pool.
    # The HF Space inference takes ~150ms per image, but adding network
    # round-trip + cold-start latency, sequential calls would feel slow
    # on locations with 5+ photos. With 4 workers, 10 photos take ~3 the
    # time of 1 photo instead of 10x.
    #
    # We cap workers at 4 to avoid hammering the free-tier HF Space.
    claimed_features = {
        f.feature_type for f in location.accessibility_features if f.available
    }

    results = []
    max_workers = min(4, len(photo_urls))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all jobs first, then collect as they complete
        future_to_url = {
            executor.submit(_classify_one_photo, url, service_url, secret): url
            for url in photo_urls
        }
        for future in as_completed(future_to_url):
            results.append(future.result())

    # Preserve the original photo order in the response — as_completed
    # gives us results in finish order, which is unpredictable.
    url_to_result = {r["photo_url"]: r for r in results}
    ordered_results = [url_to_result[url] for url in photo_urls]

    # Compute summary counts
    successful = sum(1 for r in ordered_results if r["success"])
    failed = len(ordered_results) - successful
    feature_match = sum(
        1 for r in ordered_results
        if r["success"] and r["predicted_class"] in claimed_features
    )
    feature_mismatch = successful - feature_match

    return jsonify({
        "location_id": location.id,
        "location_name": location.name,
        "claimed_features": sorted(claimed_features),
        "results": ordered_results,
        "summary": {
            "total_photos": len(photo_urls),
            "successful": successful,
            "failed": failed,
            "feature_match_count": feature_match,
            "feature_mismatch_count": feature_mismatch,
        },
        "analyzed_at": datetime.utcnow().isoformat(),
    }), 200


@cv_api.route("/cv/predict", methods=["POST"])
@admin_jwt_required
def cv_predict_single():
    """
    Classify a single arbitrary image URL. Handy for ad-hoc admin testing
    or for a future "test a photo" panel feature without going through a
    location.

    Request JSON: { "image_url": "https://..." }
    Response: result dict from _classify_one_photo (success or error)
    """
    service_url = current_app.config.get("CV_SERVICE_URL", "")
    secret = current_app.config.get("CV_SHARED_SECRET", "")
    if not service_url:
        return jsonify({"error": "CV_SERVICE_URL is not set on the server."}), 503

    data = request.get_json(silent=True)
    if not data or not data.get("image_url"):
        return jsonify({"error": "image_url is required"}), 400

    result = _classify_one_photo(data["image_url"], service_url, secret)
    status_code = 200 if result["success"] else 502
    return jsonify(result), status_code
