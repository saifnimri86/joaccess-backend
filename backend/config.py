from datetime import timedelta
import os


def _parse_csv_env(name: str, default: str = "") -> list[str]:
    """read a comma-separated env var into a cleaned list."""
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _normalize_db_url(url: str) -> str:
    # render.com hands out postgres:// but sqlalchemy 2.x needs postgresql://
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL", "sqlite:///accessibility_map.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # TODO: migrate to supabase storage
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "static/uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-only-change-me-jwt")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    CORS_ORIGINS = _parse_csv_env(
        "CORS_ORIGINS",
        default="http://localhost:3000,https://joaccess-admin.netlify.app",
    )

    # only emails listed here can become admin at signup
    ADMIN_EMAILS = _parse_csv_env("ADMIN_EMAILS", default="")

    OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
    ASSISTANT_API_KEY = os.environ.get("ASSISTANT_API_KEY", "")

    # cv_shared_secret must match the one set in the hf space's secrets tab
    CV_SERVICE_URL = os.environ.get("CV_SERVICE_URL", "")
    CV_SHARED_SECRET = os.environ.get("CV_SHARED_SECRET", "")

    DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"

    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
