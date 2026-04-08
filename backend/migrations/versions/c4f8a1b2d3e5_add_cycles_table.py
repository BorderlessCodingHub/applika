"""add cycles table and cycle_id to applications and reports

Revision ID: c4f8a1b2d3e5
Revises: 49792420ad7b
Create Date: 2026-04-05 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c4f8a1b2d3e5'
down_revision: Union[str, Sequence[str], None] = '49792420ad7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- 1. Create cycles table
    op.create_table(
        'cycles',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            name='fk_cycles_user_id',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_cycles'),
    )
    op.create_index('idx_cycles_user_id', 'cycles', ['user_id'])

    # -- 2. Add cycle_id FK to applications
    op.add_column(
        'applications',
        sa.Column('cycle_id', sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        'fk_applications_cycle_id',
        'applications', 'cycles',
        ['cycle_id'], ['id'],
        ondelete='SET NULL',
    )

    # -- 3. Add cycle_id FK to quinzenal_reports
    op.add_column(
        'quinzenal_reports',
        sa.Column('cycle_id', sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        'fk_quinzenal_reports_cycle_id',
        'quinzenal_reports', 'cycles',
        ['cycle_id'], ['id'],
        ondelete='SET NULL',
    )

    # -- 4. Replace unique constraint on reports: (user_id, report_day)
    #        with (user_id, report_day, cycle_id)
    op.drop_constraint(
        'uq_quinzenal_reports_user_day',
        'quinzenal_reports',
        type_='unique',
    )
    op.create_unique_constraint(
        'uq_quinzenal_reports_user_day_cycle',
        'quinzenal_reports',
        ['user_id', 'report_day', 'cycle_id'],
    )

    # -- 5. Partial unique index for NULL cycle_id (current cycle)
    op.create_index(
        'uq_quinzenal_reports_user_day_null_cycle',
        'quinzenal_reports',
        ['user_id', 'report_day'],
        unique=True,
        postgresql_where=sa.text('cycle_id IS NULL'),
    )


def downgrade() -> None:
    # -- Reverse partial index
    op.drop_index(
        'uq_quinzenal_reports_user_day_null_cycle',
        table_name='quinzenal_reports',
    )

    # -- Restore original unique constraint on reports
    op.drop_constraint(
        'uq_quinzenal_reports_user_day_cycle',
        'quinzenal_reports',
        type_='unique',
    )

    # Clear cycle_id before restoring unique constraint
    op.execute(
        sa.text('UPDATE quinzenal_reports SET cycle_id = NULL')
    )
    op.create_unique_constraint(
        'uq_quinzenal_reports_user_day',
        'quinzenal_reports',
        ['user_id', 'report_day'],
    )

    # -- Drop cycle_id from quinzenal_reports
    op.drop_constraint(
        'fk_quinzenal_reports_cycle_id',
        'quinzenal_reports',
        type_='foreignkey',
    )
    op.drop_column('quinzenal_reports', 'cycle_id')

    # -- Drop cycle_id from applications
    op.drop_constraint(
        'fk_applications_cycle_id',
        'applications',
        type_='foreignkey',
    )
    op.drop_column('applications', 'cycle_id')

    # -- Drop cycles table
    op.drop_index('idx_cycles_user_id', table_name='cycles')
    op.drop_table('cycles')
