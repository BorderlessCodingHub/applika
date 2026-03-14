"""add enums and new columns to users and applications

Revision ID: 77c96a061d09
Revises: d47505cfb232
Create Date: 2026-03-14 17:30:05.058290

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '77c96a061d09'
down_revision: Union[str, Sequence[str], None] = 'd47505cfb232'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Enum type definitions
currency_enum = sa.Enum(
    'USD',
    'BRL',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
    'CHF',
    'INR',
    name='currency',
)
salaryperiod_enum = sa.Enum(
    'hourly',
    'monthly',
    'annual',
    name='salaryperiod',
)
experiencelevel_enum = sa.Enum(
    'intern',
    'junior',
    'mid_level',
    'senior',
    'staff',
    'lead',
    'principal',
    'specialist',
    name='experiencelevel',
)
workmode_enum = sa.Enum(
    'remote',
    'hybrid',
    'on_site',
    name='workmode',
)
availability_enum = sa.Enum(
    'open_to_work',
    'casually_looking',
    'not_looking',
    name='availability',
)


def upgrade() -> None:
    """Upgrade schema."""
    # Create enum types first
    currency_enum.create(op.get_bind(), checkfirst=True)
    salaryperiod_enum.create(op.get_bind(), checkfirst=True)
    experiencelevel_enum.create(op.get_bind(), checkfirst=True)
    workmode_enum.create(op.get_bind(), checkfirst=True)
    availability_enum.create(op.get_bind(), checkfirst=True)

    # Application columns
    op.add_column(
        'applications', sa.Column('currency', currency_enum, nullable=True)
    )
    op.add_column(
        'applications',
        sa.Column('salary_period', salaryperiod_enum, nullable=True),
    )
    op.add_column(
        'applications',
        sa.Column('experience_level', experiencelevel_enum, nullable=True),
    )
    op.add_column(
        'applications', sa.Column('work_mode', workmode_enum, nullable=True)
    )
    op.add_column(
        'applications',
        sa.Column('country', sa.String(length=100), nullable=True),
    )

    # User columns
    op.add_column(
        'users',
        sa.Column('current_role', sa.String(length=200), nullable=True),
    )
    op.add_column(
        'users', sa.Column('salary_currency', currency_enum, nullable=True)
    )
    op.add_column(
        'users', sa.Column('salary_period', salaryperiod_enum, nullable=True)
    )
    op.add_column(
        'users',
        sa.Column('seniority_level', experiencelevel_enum, nullable=True),
    )
    op.add_column(
        'users', sa.Column('location', sa.String(length=200), nullable=True)
    )
    op.add_column(
        'users', sa.Column('availability', availability_enum, nullable=True)
    )
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column(
        'users',
        sa.Column('linkedin_url', sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop columns
    op.drop_column('users', 'linkedin_url')
    op.drop_column('users', 'bio')
    op.drop_column('users', 'availability')
    op.drop_column('users', 'location')
    op.drop_column('users', 'seniority_level')
    op.drop_column('users', 'salary_period')
    op.drop_column('users', 'salary_currency')
    op.drop_column('users', 'current_role')
    op.drop_column('applications', 'country')
    op.drop_column('applications', 'work_mode')
    op.drop_column('applications', 'experience_level')
    op.drop_column('applications', 'salary_period')
    op.drop_column('applications', 'currency')

    # Drop enum types
    availability_enum.drop(op.get_bind(), checkfirst=True)
    workmode_enum.drop(op.get_bind(), checkfirst=True)
    experiencelevel_enum.drop(op.get_bind(), checkfirst=True)
    salaryperiod_enum.drop(op.get_bind(), checkfirst=True)
    currency_enum.drop(op.get_bind(), checkfirst=True)
