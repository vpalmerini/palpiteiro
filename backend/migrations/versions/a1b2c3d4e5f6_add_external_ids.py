"""add external_id columns for football-data.org integration

Revision ID: a1b2c3d4e5f6
Revises: b2e4f6a8c0d1
Create Date: 2026-06-13 12:00:00.000000

"""
import sqlalchemy as sa
from alembic import op


revision = "a1b2c3d4e5f6"
down_revision = "b2e4f6a8c0d1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tournaments", sa.Column("external_competition_code", sa.String(16), nullable=True))
    op.add_column("teams", sa.Column("external_id", sa.Integer, nullable=True))
    op.add_column("matches", sa.Column("external_id", sa.Integer, nullable=True))

    op.create_index("ix_teams_external_id", "teams", ["external_id"])
    op.create_index("ix_matches_external_id", "matches", ["external_id"])


def downgrade():
    op.drop_index("ix_matches_external_id", table_name="matches")
    op.drop_index("ix_teams_external_id", table_name="teams")

    op.drop_column("matches", "external_id")
    op.drop_column("teams", "external_id")
    op.drop_column("tournaments", "external_competition_code")
