"""add_palpitao_to_pools_and_predictions

Revision ID: b3f8a1d2e4c9
Revises: a1b2c3d4e5f6
Create Date: 2026-06-21 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3f8a1d2e4c9'
down_revision = 'f1e2d3c4b5a6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('pools', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_multiplier_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('multiplier_value', sa.Integer(), nullable=False, server_default='3'))

    with op.batch_alter_table('predictions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('has_multiplier', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('predictions', schema=None) as batch_op:
        batch_op.drop_column('has_multiplier')

    with op.batch_alter_table('pools', schema=None) as batch_op:
        batch_op.drop_column('multiplier_value')
        batch_op.drop_column('is_multiplier_enabled')
