"""add teams name index (safe for DBs stamped before index existed)

Revision ID: f8a1b2c3d4e5
Revises: d129c90f03ee
Create Date: 2026-05-27 20:00:00.000000

"""
from alembic import op


revision = "f8a1b2c3d4e5"
down_revision = "d129c90f03ee"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_teams_name_active
        ON teams (name)
        WHERE deleted_at IS NULL
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_teams_name_active")
