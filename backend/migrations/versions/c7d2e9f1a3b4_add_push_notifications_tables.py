"""add_push_notifications_tables

Revision ID: c7d2e9f1a3b4
Revises: 5bedcb75c195
Create Date: 2026-06-07 10:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7d2e9f1a3b4'
down_revision = '5bedcb75c195'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.String(length=255), nullable=False),
        sa.Column('auth', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('push_subscriptions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_push_subscriptions_deleted_at'), ['deleted_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_push_subscriptions_user_id'), ['user_id'], unique=False)
        batch_op.create_index('uq_push_subscription_endpoint_active', ['endpoint'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'), sqlite_where=sa.text('deleted_at IS NULL'))

    op.create_table(
        'notification_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('kind', sa.String(length=64), nullable=False),
        sa.Column('dedup_key', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('notification_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notification_logs_deleted_at'), ['deleted_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_notification_logs_user_id'), ['user_id'], unique=False)
        batch_op.create_index('uq_notification_log_active', ['user_id', 'kind', 'dedup_key'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'), sqlite_where=sa.text('deleted_at IS NULL'))


def downgrade():
    with op.batch_alter_table('notification_logs', schema=None) as batch_op:
        batch_op.drop_index('uq_notification_log_active', postgresql_where=sa.text('deleted_at IS NULL'), sqlite_where=sa.text('deleted_at IS NULL'))
        batch_op.drop_index(batch_op.f('ix_notification_logs_user_id'))
        batch_op.drop_index(batch_op.f('ix_notification_logs_deleted_at'))
    op.drop_table('notification_logs')

    with op.batch_alter_table('push_subscriptions', schema=None) as batch_op:
        batch_op.drop_index('uq_push_subscription_endpoint_active', postgresql_where=sa.text('deleted_at IS NULL'), sqlite_where=sa.text('deleted_at IS NULL'))
        batch_op.drop_index(batch_op.f('ix_push_subscriptions_user_id'))
        batch_op.drop_index(batch_op.f('ix_push_subscriptions_deleted_at'))
    op.drop_table('push_subscriptions')
