"""
models.py
=========
SQLAlchemy ORM models for the JOAccess backend.

All models inherit from `db.Model` (SQLAlchemy's declarative base, pulled
in through extensions.py). Auth is JWT-only, so no mixins from
flask-login are needed — the API treats a user as "just a row" and
proves identity through the JWT claim.

When you add or change columns here, generate a migration:
    flask db migrate -m "short description"
    flask db upgrade
"""

from datetime import datetime

from extensions import db


class User(db.Model):
    """
    Application user — both regular users (people with disabilities,
    caregivers, general public) and organizations (NGOs, businesses)
    share this table, differentiated by `user_type`.
    """
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)  # bcrypt hash
    user_type = db.Column(db.String(20), nullable=False)  # "user" | "organization"
    org_name = db.Column(db.String(200))                  # only set when user_type == "organization"
    disability = db.Column(db.String(200))                # optional; free-text or preset value
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    accessibility_settings = db.Column(db.Text)           # JSON-encoded user preferences (font size, contrast, etc.)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # A user may create many locations; deleting the user cascades to their locations.
    locations = db.relationship(
        "Location",
        foreign_keys="Location.user_id",
        backref="creator",
        lazy=True,
        cascade="all, delete-orphan",
    )
    # A user may verify many locations (admins only). No cascade — verifier
    # leaving shouldn't nuke their verified locations; we just null out
    # `verified_by` manually if ever needed.
    verified_locations = db.relationship(
        "Location",
        foreign_keys="Location.verified_by",
        backref="verifier",
        lazy=True,
    )
    # Deleting a user cascades their reviews too.
    reviews = db.relationship(
        "Review",
        backref="author",
        lazy=True,
        cascade="all, delete-orphan",
    )


class Location(db.Model):
    """
    A place on the map. Created by any user, made visible after an admin
    verifies it (unverified pins show orange in the mobile app).
    """
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    description_ar = db.Column(db.Text)
    category = db.Column(db.String(100), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    address = db.Column(db.String(300))
    address_ar = db.Column(db.String(300))

    # Who created this pin.
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    # Verification tracking — set when an admin approves the location.
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    verified_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    verified_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    accessibility_features = db.relationship(
        "AccessibilityFeature", backref="location", lazy=True, cascade="all, delete-orphan"
    )
    photos = db.relationship(
        "Photo", backref="location", lazy=True, cascade="all, delete-orphan"
    )
    reviews = db.relationship(
        "Review", backref="location", lazy=True, cascade="all, delete-orphan"
    )
    reports = db.relationship(
        "Report", backref="location", lazy=True, cascade="all, delete-orphan"
    )


class AccessibilityFeature(db.Model):
    """One row per accessibility feature flag per location (wheelchair ramp, braille, etc.)."""
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    feature_type = db.Column(db.String(100), nullable=False)  # e.g. "wheelchair_ramp"
    available = db.Column(db.Boolean, default=True, nullable=False)
    notes = db.Column(db.Text)
    notes_ar = db.Column(db.Text)


class Photo(db.Model):
    """Reference to an uploaded photo file. Filename is stored; file itself lives on disk (TODO: Supabase Storage)."""
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    filename = db.Column(db.String(300), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Review(db.Model):
    """A user's rating + comment for a location."""
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5, validated at API layer
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Report(db.Model):
    """
    A user-submitted report flagging something wrong with a location
    (incorrect info, inappropriate content, etc.). Admins resolve or
    delete these from the admin panel.

    `resolved_at` being NULL = open report. Non-null = resolved, with
    `resolved_by` pointing at the admin who handled it. This replaces
    the old "[RESOLVED] " text prefix hack.
    """
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    reason = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # NEW: proper resolution tracking (replaces the "[RESOLVED] " prefix hack).
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    # Reporter relationship (who filed the report).
    user = db.relationship("User", foreign_keys=[user_id], backref="reports")
    # Resolver relationship (admin who handled it). No backref — we rarely need
    # "all reports this admin resolved", and naming collisions are annoying.
    resolver = db.relationship("User", foreign_keys=[resolved_by])
