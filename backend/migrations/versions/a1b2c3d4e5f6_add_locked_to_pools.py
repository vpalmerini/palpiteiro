"""add_locked_to_pools

Revision ID: a1b2c3d4e5f6
Revises: 5bedcb75c195
Create Date: 2026-06-11 19:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '5bedcb75c195'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('pools', schema=None) as batch_op:
        batch_op.add_column(sa.Column('locked', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('pools', schema=None) as batch_op:
        batch_op.drop_column('locked')
