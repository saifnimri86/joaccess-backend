"""
app.py
======
JOAccess backend entry point.

This is now a pure API server:
    * /api/v1/*      -> mobile app routes (api_blueprint.py)
    * /api/admin/*   -> admin panel routes (admin_blueprint.py)
    * /health        -> simple liveness probe for Render.com

No Jinja templates, no session auth, no web forms. The old GP1 web UI
lives in a separate repo.

Run locally:
    python app.py
Run in production (Render.com):
    gunicorn app:app
"""

from dotenv import load_dotenv
load_dotenv()  # Must run BEFORE importing config, so Config can see env vars.

from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate

from config import Config
from extensions import db, bcrypt, jwt


def create_app(config_class: type = Config) -> Flask:
    """
    Application factory.

    Using a factory (instead of a module-level `app = Flask(...)`) makes
    testing cleaner and prevents circular imports — blueprints can import
    `db` from extensions.py without ever touching app.py.
    """
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ── Extensions ─────────────────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    Migrate(app, db)

    CORS(
        app,
        resources={
            r"/api/*": {"origins": app.config["CORS_ORIGINS"]},
        },
    )

    # ── Blueprints ─────────────────────────────────────────────────────
    # Imported inside the factory to avoid circular-import issues:
    # blueprints import `db` from extensions, not from this module.
    from api_blueprint import mobile_api
    from admin_blueprint import admin_api

    app.register_blueprint(mobile_api, url_prefix="/api/v1")
    app.register_blueprint(admin_api, url_prefix="/api/admin")

    # ── Top-level routes ───────────────────────────────────────────────
    @app.route("/health")
    def health():
        """Render.com and uptime monitors hit this. Keep it trivial."""
        return jsonify({"status": "ok", "service": "joaccess-backend"}), 200

    @app.route("/")
    def root():
        """Friendly 200 at the root so bare pings don't 404."""
        return jsonify({
            "service": "joaccess-backend",
            "endpoints": {
                "mobile_api": "/api/v1",
                "admin_api": "/api/admin",
                "health": "/health",
            },
        }), 200

    # ── Error handlers (return JSON, never HTML) ───────────────────────
    @app.errorhandler(404)
    def not_found(_err):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(_err):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def server_error(_err):
        # Roll back any pending DB transaction so the next request
        # doesn't inherit a broken session.
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500

    return app


# ─────────────────────────────────────────────────────────────────────────
# Module-level `app` so `gunicorn app:app` works in production.
# ─────────────────────────────────────────────────────────────────────────
app = create_app()


if __name__ == "__main__":
    app.run(
        debug=app.config["DEBUG"],
        host="0.0.0.0",
        port=5000,
    )
