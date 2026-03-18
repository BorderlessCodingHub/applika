from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '79f1d9bc77de'
down_revision: Union[str, Sequence[str], None] = 'd997fc17b3d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'quinzenal_reports',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('report_day', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('phase', sa.Integer(), nullable=False),
        sa.Column('applications_count', sa.Integer(), nullable=False),
        sa.Column(
            'callback_rate', sa.Numeric(precision=5, scale=2), nullable=False
        ),
        sa.Column('initial_screenings_count', sa.Integer(), nullable=False),
        sa.Column(
            'interviews_completed_fortnight',
            sa.Integer(),
            nullable=False,
        ),
        sa.Column('active_processes_count', sa.Integer(), nullable=False),
        sa.Column('offers_count', sa.Integer(), nullable=False),
        sa.Column(
            'offer_rate', sa.Numeric(precision=5, scale=2), nullable=False
        ),
        sa.Column('total_applications_count', sa.Integer(), nullable=False),
        sa.Column(
            'overall_conversion_rate',
            sa.Numeric(precision=5, scale=2),
            nullable=False,
        ),
        sa.Column('total_initial_screenings_count', sa.Integer(), nullable=False),
        sa.Column('mock_interviews_count', sa.Integer(), nullable=False),
        sa.Column('linkedin_posts_count', sa.Integer(), nullable=False),
        sa.Column('strategic_connections_count', sa.Integer(), nullable=False),
        sa.Column('biggest_win', sa.String(length=280), nullable=False),
        sa.Column('biggest_challenge', sa.String(length=280), nullable=False),
        sa.Column('next_fortnight_goal', sa.String(length=500), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('discord_posted', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            'phase IN (1, 2, 3, 4)',
            name='ck_quinzenal_reports_phase',
        ),
        sa.CheckConstraint(
            'report_day IN (1, 14, 28, 42, 56, 70, 84, 98, 112, 120)',
            name='ck_quinzenal_reports_report_day',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_quinzenal_reports_user_id',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_quinzenal_reports'),
        sa.UniqueConstraint(
            'user_id',
            'report_day',
            name='uq_quinzenal_reports_user_day',
        ),
    )
    op.create_index(
        'idx_quinzenal_reports_report_day',
        'quinzenal_reports',
        ['report_day'],
    )
    op.create_index(
        'idx_quinzenal_reports_user_day',
        'quinzenal_reports',
        ['user_id', 'report_day'],
    )
    op.create_index(
        'idx_quinzenal_reports_user_id',
        'quinzenal_reports',
        ['user_id'],
    )


def downgrade() -> None:
    op.drop_index('idx_quinzenal_reports_user_id', table_name='quinzenal_reports')
    op.drop_index(
        'idx_quinzenal_reports_user_day',
        table_name='quinzenal_reports',
    )
    op.drop_index(
        'idx_quinzenal_reports_report_day',
        table_name='quinzenal_reports',
    )
    op.drop_table('quinzenal_reports')
