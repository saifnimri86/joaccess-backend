"""
test_app.py
===========
Basic test suite for the JOAccess Flask backend.

These tests spin up the app in test mode using an in-memory SQLite database
so no real Postgres/Supabase connection is needed in CI. Every test gets a
fresh database thanks to the setup/teardown fixtures.
"""

import json
import os
import pytest

from app import create_app
from extensions import db as _db

# File-based SQLite path — written to /tmp so it's always writable in CI.
# We use a file instead of :memory: because SQLAlchemy's :memory: creates
# a NEW empty database for every connection. The test client's requests
# each open their own connection, so they'd never see the tables created
# by db.create_all(). A file-based DB persists across all connections
# within the same process, solving this entirely.
TEST_DB_PATH = "/tmp/joaccess_test.db"
TEST_DB_URI = f"sqlite:///{TEST_DB_PATH}"


# ─────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    """
    Create one Flask app instance for the whole test session.
    Uses a file-based SQLite DB so tables are visible across connections.
    scope="session" means this runs once — not once per test.
    """
    class TestConfig:
        TESTING = True
        SECRET_KEY = "test-secret"
        JWT_SECRET_KEY = "test-jwt-secret"
        SQLALCHEMY_DATABASE_URI = TEST_DB_URI
        SQLALCHEMY_TRACK_MODIFICATIONS = False
        UPLOAD_FOLDER = "/tmp/joaccess-test-uploads"
        MAX_CONTENT_LENGTH = 16 * 1024 * 1024
        CORS_ORIGINS = ["http://localhost:3000"]
        ADMIN_EMAILS = ["admin@test.com"]
        OPENROUTER_API_KEY = ""
        ASSISTANT_API_KEY = ""
        CV_SERVICE_URL = ""
        CV_SHARED_SECRET = ""
        SUPABASE_URL = ""
        SUPABASE_SERVICE_KEY = ""
        DEBUG = False

    # Remove any leftover DB file from a previous run so we always
    # start with a clean slate
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)

    application = create_app(TestConfig)
    return application


@pytest.fixture(scope="session")
def client(app):
    """Flask test client — lets us send HTTP requests without a real server."""
    return app.test_client()


@pytest.fixture(scope="session")
def init_db(app):
    """
    Create all tables once at the start of the session, drop them at the end.
    scope="session" means this runs once total, not once per test.

    We import models explicitly before calling create_all() because SQLAlchemy
    only creates tables for model classes it has seen imported. The app factory
    imports blueprints, but if a model class hasn't been imported yet SQLAlchemy
    doesn't know its table exists — so create_all() silently skips it.
    Importing models here guarantees every table is registered first.
    """
    with app.app_context():
        import models  # noqa: F401 — registers all models with SQLAlchemy metadata
        _db.create_all()
    yield
    with app.app_context():
        _db.drop_all()
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


@pytest.fixture(autouse=True)
def clean_db(app, init_db):
    """
    Delete all rows from every table after each test so tests don't
    bleed into each other. We DELETE rather than rollback because the
    test client commits its own transactions internally.
    autouse=True applies this to every test automatically.
    """
    yield
    with app.app_context():
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()


# ─────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────

def post_json(client, url, data):
    """Convenience wrapper for JSON POST requests."""
    return client.post(
        url,
        data=json.dumps(data),
        content_type="application/json",
    )


def get_auth_token(client):
    """
    Register an admin user and return a valid JWT access token.
    Used by tests that need an authenticated request.
    """
    # Register
    post_json(client, "/api/v1/auth/signup", {
        "username": "testadmin",
        "email": "admin@test.com",   # in ADMIN_EMAILS so is_admin=True
        "password": "testpass123",
        "user_type": "individual",
    })
    # Login
    resp = post_json(client, "/api/v1/auth/login", {
        "email": "admin@test.com",
        "password": "testpass123",
    })
    return json.loads(resp.data)["access_token"]


def get_user_token(client):
    """
    Register a regular (non-admin) user and return their JWT token.
    Used by tests that need an authenticated but non-admin request.
    """
    post_json(client, "/api/v1/auth/signup", {
        "username": "regularuser",
        "email": "user@test.com",
        "password": "testpass123",
        "user_type": "individual",
    })
    resp = post_json(client, "/api/v1/auth/login", {
        "email": "user@test.com",
        "password": "testpass123",
    })
    return json.loads(resp.data)["access_token"]


# ─────────────────────────────────────────────
# TESTS — Health & Root
# ─────────────────────────────────────────────

class TestHealth:
    def test_root_returns_200(self, client):
        resp = client.get("/")
        assert resp.status_code == 200

    def test_root_contains_service_name(self, client):
        resp = client.get("/")
        assert "joaccess-backend" in resp.data.decode()

    def test_health_endpoint(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["status"] == "ok"

    def test_api_health_endpoint(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["status"] == "ok"

    def test_unknown_route_returns_404(self, client):
        resp = client.get("/this-route-does-not-exist")
        assert resp.status_code == 404

    def test_404_returns_json(self, client):
        resp = client.get("/nonexistent")
        assert resp.content_type == "application/json"


# ─────────────────────────────────────────────
# TESTS — Auth: Signup
# ─────────────────────────────────────────────

class TestSignup:
    def test_signup_success(self, client):
        resp = post_json(client, "/api/v1/auth/signup", {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "password123",
            "user_type": "individual",
        })
        assert resp.status_code == 201
        data = json.loads(resp.data)
        assert data["success"] is True

    def test_signup_missing_fields_returns_400(self, client):
        resp = post_json(client, "/api/v1/auth/signup", {
            "username": "incomplete",
        })
        assert resp.status_code == 400

    def test_signup_short_password_returns_400(self, client):
        resp = post_json(client, "/api/v1/auth/signup", {
            "username": "shortpw",
            "email": "shortpw@example.com",
            "password": "abc",
            "user_type": "individual",
        })
        assert resp.status_code == 400

    def test_signup_duplicate_email_returns_409(self, client):
        payload = {
            "username": "dupuser1",
            "email": "dup@example.com",
            "password": "password123",
            "user_type": "individual",
        }
        client.post("/api/v1/auth/signup",
                    data=json.dumps(payload),
                    content_type="application/json")
        # Second signup with same email
        payload["username"] = "dupuser2"
        resp = post_json(client, "/api/v1/auth/signup", payload)
        assert resp.status_code == 409

    def test_signup_invalid_user_type_returns_400(self, client):
        resp = post_json(client, "/api/v1/auth/signup", {
            "username": "badtype",
            "email": "badtype@example.com",
            "password": "password123",
            "user_type": "superadmin",  # not a valid type
        })
        assert resp.status_code == 400

    def test_signup_no_body_returns_400(self, client):
        resp = client.post("/api/v1/auth/signup")
        assert resp.status_code == 400


# ─────────────────────────────────────────────
# TESTS — Auth: Login
# ─────────────────────────────────────────────

class TestLogin:
    def test_login_success(self, client):
        post_json(client, "/api/v1/auth/signup", {
            "username": "logintest",
            "email": "logintest@example.com",
            "password": "password123",
            "user_type": "individual",
        })
        resp = post_json(client, "/api/v1/auth/login", {
            "email": "logintest@example.com",
            "password": "password123",
        })
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "access_token" in data
        assert "refresh_token" in data

    def test_login_wrong_password_returns_401(self, client):
        post_json(client, "/api/v1/auth/signup", {
            "username": "wrongpw",
            "email": "wrongpw@example.com",
            "password": "correctpassword",
            "user_type": "individual",
        })
        resp = post_json(client, "/api/v1/auth/login", {
            "email": "wrongpw@example.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user_returns_401(self, client):
        resp = post_json(client, "/api/v1/auth/login", {
            "email": "ghost@example.com",
            "password": "password123",
        })
        assert resp.status_code == 401

    def test_login_no_body_returns_400(self, client):
        resp = client.post("/api/v1/auth/login")
        assert resp.status_code == 400


# ─────────────────────────────────────────────
# TESTS — Auth: Protected routes
# ─────────────────────────────────────────────

class TestProtectedRoutes:
    def test_me_without_token_returns_401(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_me_with_valid_token(self, client):
        token = get_user_token(client)
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "user" in data


# ─────────────────────────────────────────────
# TESTS — Locations
# ─────────────────────────────────────────────

class TestLocations:
    def test_get_locations_public(self, client):
        """Location listing is public — no auth needed."""
        resp = client.get("/api/v1/locations")
        assert resp.status_code == 200
        assert isinstance(json.loads(resp.data), list)

    def test_create_location_without_token_returns_401(self, client):
        resp = post_json(client, "/api/v1/locations", {
            "name": "Test Place",
            "name_ar": "مكان تجريبي",
            "category": "park",
            "latitude": 32.0,
            "longitude": 36.0,
        })
        assert resp.status_code == 401

    def test_create_location_with_token(self, client):
        token = get_user_token(client)
        resp = post_json(client, "/api/v1/locations", {
            "name": "Test Park",
            "name_ar": "حديقة تجريبية",
            "category": "park",
            "latitude": 32.0853,
            "longitude": 35.8656,
        })
        # Attach auth header properly
        resp = client.post(
            "/api/v1/locations",
            data=json.dumps({
                "name": "Test Park",
                "name_ar": "حديقة تجريبية",
                "category": "park",
                "latitude": 32.0853,
                "longitude": 35.8656,
            }),
            content_type="application/json",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = json.loads(resp.data)
        assert data["success"] is True

    def test_create_location_missing_fields_returns_400(self, client):
        token = get_user_token(client)
        resp = client.post(
            "/api/v1/locations",
            data=json.dumps({"name": "Incomplete"}),
            content_type="application/json",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400

    def test_get_nonexistent_location_returns_404(self, client):
        resp = client.get("/api/v1/locations/999999")
        assert resp.status_code == 404


# ─────────────────────────────────────────────
# TESTS — Admin routes
# ─────────────────────────────────────────────

class TestAdminRoutes:
    def test_admin_login_success(self, client):
        # Admin email is in ADMIN_EMAILS in TestConfig
        post_json(client, "/api/v1/auth/signup", {
            "username": "adminlogintest",
            "email": "admin@test.com",
            "password": "adminpass123",
            "user_type": "individual",
        })
        resp = post_json(client, "/api/admin/login", {
            "email": "admin@test.com",
            "password": "adminpass123",
        })
        assert resp.status_code == 200
        assert "access_token" in json.loads(resp.data)

    def test_admin_login_non_admin_returns_403(self, client):
        post_json(client, "/api/v1/auth/signup", {
            "username": "notanadmin",
            "email": "notadmin@example.com",
            "password": "password123",
            "user_type": "individual",
        })
        resp = post_json(client, "/api/admin/login", {
            "email": "notadmin@example.com",
            "password": "password123",
        })
        assert resp.status_code == 403

    def test_admin_stats_without_token_returns_401(self, client):
        resp = client.get("/api/admin/stats")
        assert resp.status_code == 401

    @pytest.mark.skip(
        reason=(
            "admin/stats uses to_char() which is PostgreSQL-only. "
            "SQLite test DB doesn't support it. Verified manually on Render."
        )
    )
    def test_admin_stats_with_admin_token(self, client):
        token = get_auth_token(client)
        resp = client.get(
            "/api/admin/stats",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_admin_get_locations(self, client):
        token = get_auth_token(client)
        resp = client.get(
            "/api/admin/locations",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "locations" in data

    def test_admin_get_users(self, client):
        token = get_auth_token(client)
        resp = client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "users" in data

    def test_admin_get_reports(self, client):
        token = get_auth_token(client)
        resp = client.get(
            "/api/admin/reports",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_admin_get_reviews(self, client):
        token = get_auth_token(client)
        resp = client.get(
            "/api/admin/reviews",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_cv_health_without_token_returns_401(self, client):
        """CV endpoint should be admin-only."""
        resp = client.get("/api/admin/cv/health")
        assert resp.status_code == 401
