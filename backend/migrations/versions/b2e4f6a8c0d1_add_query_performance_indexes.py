"""add query performance indexes for user-facing routes

Revision ID: b2e4f6a8c0d1
Revises: f8a1b2c3d4e5
Create Date: 2026-05-27 21:00:00.000000

"""
from alembic import op


revision = "b2e4f6a8c0d1"
down_revision = "f8a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_matches_tournament_starts_at_active
        ON matches (tournament_id, starts_at)
        WHERE deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_matches_tournament_status_active
        ON matches (tournament_id, status)
        WHERE deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_predictions_pool_match_active
        ON predictions (pool_id, match_id)
        WHERE deleted_at IS NULL
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_predictions_pool_match_active")
    op.execute("DROP INDEX IF EXISTS ix_matches_tournament_status_active")
    op.execute("DROP INDEX IF EXISTS ix_matches_tournament_starts_at_active")
