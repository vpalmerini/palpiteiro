from datetime import datetime, timezone

from sqlalchemy import Index, text

from .extensions import db

ACTIVE_ONLY = text("deleted_at IS NULL")


def utc_now():
    return datetime.now(timezone.utc)


def active_unique_index(name: str, *columns: str) -> Index:
    return Index(
        name,
        *columns,
        unique=True,
        postgresql_where=ACTIVE_ONLY,
        sqlite_where=ACTIVE_ONLY,
    )


class TimestampSoftDeleteMixin:
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)

    @classmethod
    def active(cls):
        return cls.query.filter(cls.deleted_at.is_(None))

    @classmethod
    def active_or_404(cls, pk):
        return cls.active().filter_by(id=str(pk)).first_or_404()

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        if self.is_deleted:
            return
        now = utc_now()
        self.deleted_at = now
        self.updated_at = now

    def restore(self) -> None:
        self.deleted_at = None
        self.updated_at = utc_now()
