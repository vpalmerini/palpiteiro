"""top_scorers_array

Revision ID: a2b3c4d5e6f7
Revises: e4a7c9d2f1b3
Create Date: 2026-07-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a2b3c4d5e6f7'
down_revision = 'e4a7c9d2f1b3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tournaments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('top_scorers', sa.JSON(), nullable=True))

    # Migrate existing single top_scorer value into the new JSON array column
    op.execute(
        """
        UPDATE tournaments
        SET top_scorers = to_jsonb(ARRAY[top_scorer])
        WHERE top_scorer IS NOT NULL AND deleted_at IS NULL
        """
    )

    with op.batch_alter_table('tournaments', schema=None) as batch_op:
        batch_op.drop_column('top_scorer')


def downgrade():
    with op.batch_alter_table('tournaments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('top_scorer', sa.String(length=120), nullable=True))

    # Restore first element of the array into the old column
    op.execute(
        """
        UPDATE tournaments
        SET top_scorer = top_scorers->>0
        WHERE top_scorers IS NOT NULL AND deleted_at IS NULL
        """
    )

    with op.batch_alter_table('tournaments', schema=None) as batch_op:
        batch_op.drop_column('top_scorers')
