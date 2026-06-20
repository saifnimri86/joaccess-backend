from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from functools import wraps

import requests as http_requests
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import select

cv_api = Blueprint("cv_api", __name__)


def _get_db_models():
    from extensions import db
    from models import Location, Photo
    return db, Location, Photo


def admin_jwt_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        claims = get_jwt()
        if not claims.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def _classify_one_photo(photo_url: str, service_url: str, secret: str, timeout: int = 30) -> dict:
    """post one photo to the hf space and return a normalized result.
    failures return success: False so one bad photo doesn't tank the batch."""
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


@cv_api.route("/cv/health", methods=["GET"])
@admin_jwt_required
def cv_health():
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
    """run cv classification on every photo for a location."""
    db, Location, Photo = _get_db_models()

    service_url = current_app.config.get("CV_SERVICE_URL", "")
    secret = current_app.config.get("CV_SHARED_SECRET", "")
    if not service_url:
        return jsonify({"error": "CV_SERVICE_URL is not set on the server."}), 503

    location = db.session.get(Location, location_id)
    if not location:
        return jsonify({"error": "Location not found"}), 404

    photo_urls = []
    for p in location.photos:
        if p.filename.startswith("http://") or p.filename.startswith("https://"):
            photo_urls.append(p.filename)
        else:
            photo_urls.append(f"{request.url_root}api/v1/uploads/{p.filename}")
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

    # cap workers at 4 to avoid hammering the free-tier hf space
    claimed_features = {
        f.feature_type for f in location.accessibility_features if f.available
    }

    results = []
    max_workers = min(4, len(photo_urls))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {
            executor.submit(_classify_one_photo, url, service_url, secret): url
            for url in photo_urls
        }
        for future in as_completed(future_to_url):
            results.append(future.result())

    # restore original photo order — as_completed is finish-order
    url_to_result = {r["photo_url"]: r for r in results}
    ordered_results = [url_to_result[url] for url in photo_urls]

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
    """classify a single image url for ad-hoc admin testing."""
    service_url = current_app.config.get("CV_SERVICE_URL", "")
    secret = current_app.config.get("CV_SHARED_SECRET", "")
    if not service_url:
        return jsonify({"error": "CV_SERVICE_URL is not set on the server."}), 503

    data = request.get_json(silent=True)
    if not data or not data.get("image_url"):
        return jsonify({"error": "image_url is required"}), 400

    image_url = data["image_url"]
    if not (image_url.startswith("http://") or image_url.startswith("https://")):
        image_url = f"{request.url_root}api/v1/uploads/{image_url}"

    result = _classify_one_photo(image_url, service_url, secret)
    status_code = 200 if result["success"] else 502
    return jsonify(result), status_code
