"""
config.py
=========
Central configuration for the JOAccess Flask backend.

All environment variables are read here and nowhere else. If you need
to know what configures the backend, this file is the one source of
truth.

Load order in app.py:
    1. `load_dotenv()` reads a `.env` file into os.environ (dev only; in
       production Render.com injects env vars directly).
    2. `Config` is attached to the Flask app via `app.config.from_object`.

Add new settings here rather than sprinkling `os.environ.get(...)` calls
across the codebase.
"""

from datetime import timedelta
import os


def _parse_csv_env(name: str, default: str = "") -> list[str]:
    """
    Read a comma-separated env var into a cleaned list.

    Example: ADMIN_EMAILS="a@x.com, b@x.com , c@x.com"
             -> ["a@x.com", "b@x.com", "c@x.com"]
    Empty items and surrounding whitespace are stripped.
    """
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _normalize_db_url(url: str) -> str:
    """
    Render.com and some Postgres providers hand out URLs that start with
    `postgres://`, but SQLAlchemy 2.x requires `postgresql://`. Normalize
    once here so nobody has to remember to do it elsewhere.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    # ── Core Flask ─────────────────────────────────────────────────────
    # SECRET_KEY is still used by Flask for things like flash() and
    # signed cookies. Even though we're JWT-only, Flask internals may
    # still touch it — so it stays.
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    # ── Database ───────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL", "sqlite:///accessibility_map.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Uploads ────────────────────────────────────────────────────────
    # Local disk uploads are legacy — we'll migrate to Supabase Storage
    # later. For now, the folder still exists for the mobile app's
    # multipart photo upload path in api_blueprint.py.
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "static/uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB per request

    # ── JWT ────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-only-change-me-jwt")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # ── CORS ───────────────────────────────────────────────────────────
    # Which origins are allowed to hit /api/*. Defaults cover local dev
    # and the deployed admin panel.
    CORS_ORIGINS = _parse_csv_env(
        "CORS_ORIGINS",
        default="http://localhost:3000,https://joaccess-admin.netlify.app",
    )

    # ── Admin allow-list ───────────────────────────────────────────────
    # Only users whose email appears here can receive is_admin=True at
    # signup. Managed via env so you can add/remove admins without a
    # code deploy.
    ADMIN_EMAILS = _parse_csv_env("ADMIN_EMAILS", default="")

    # ── AI (Gemma 4 via OpenRouter) ─────────────────────────────────────
    OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
    ASSISTANT_API_KEY = os.environ.get("ASSISTANT_API_KEY", "")


    # ── Debug ──────────────────────────────────────────────────────────
    DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    
    # ── Supabase Storage ───────────────────────────────────────────────
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    
