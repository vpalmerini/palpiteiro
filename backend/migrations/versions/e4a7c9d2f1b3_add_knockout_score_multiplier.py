"""add_knockout_score_multiplier

Revision ID: e4a7c9d2f1b3
Revises: b3f8a1d2e4c9
Create Date: 2026-06-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "e4a7c9d2f1b3"
down_revision = "b3f8a1d2e4c9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("pools", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("knockout_score_multiplier", sa.Integer(), nullable=False, server_default="1")
        )


def downgrade():
    with op.batch_alter_table("pools", schema=None) as batch_op:
        batch_op.drop_column("knockout_score_multiplier")
