from datetime import datetime

from extensions import db


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    user_type = db.Column(db.String(20), nullable=False)
    org_name = db.Column(db.String(200))
    disability = db.Column(db.String(200))
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    accessibility_settings = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    locations = db.relationship(
        "Location",
        foreign_keys="Location.user_id",
        backref="creator",
        lazy=True,
        cascade="all, delete-orphan",
    )
    # no cascade — verifier leaving shouldn't nuke their verified locations
    verified_locations = db.relationship(
        "Location",
        foreign_keys="Location.verified_by",
        backref="verifier",
        lazy=True,
    )
    reviews = db.relationship(
        "Review",
        backref="author",
        lazy=True,
        cascade="all, delete-orphan",
    )


class Location(db.Model):
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

    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

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
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    feature_type = db.Column(db.String(100), nullable=False)
    available = db.Column(db.Boolean, default=True, nullable=False)
    notes = db.Column(db.Text)
    notes_ar = db.Column(db.Text)


class Photo(db.Model):
    # TODO: move file storage to supabase storage
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    filename = db.Column(db.String(300), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Report(db.Model):
    # resolved_at null = open report
    id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("location.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    reason = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    user = db.relationship("User", foreign_keys=[user_id], backref="reports")
    resolver = db.relationship("User", foreign_keys=[resolved_by])
