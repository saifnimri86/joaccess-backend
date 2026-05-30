from dotenv import load_dotenv
load_dotenv()  # must run before importing config

from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate

from config import Config
from extensions import db, bcrypt, jwt


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

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

    # imported inside the factory to avoid circular-import issues
    from api_blueprint import mobile_api
    from admin_blueprint import admin_api
    from cv_blueprint import cv_api

    app.register_blueprint(mobile_api, url_prefix="/api/v1")
    app.register_blueprint(admin_api, url_prefix="/api/admin")
    app.register_blueprint(cv_api, url_prefix="/api/admin")

    @app.route("/health")
    def health():
        return jsonify({"status": "ok", "service": "joaccess-backend"}), 200

    @app.route("/")
    def root():
        return jsonify({
            "service": "joaccess-backend",
            "endpoints": {
                "mobile_api": "/api/v1",
                "admin_api": "/api/admin",
                "health": "/health",
            },
        }), 200

    @app.errorhandler(404)
    def not_found(_err):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(_err):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def server_error(_err):
        # roll back so the next request doesn't inherit a broken session
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        debug=app.config["DEBUG"],
        host="0.0.0.0",
        port=5000,
    )
