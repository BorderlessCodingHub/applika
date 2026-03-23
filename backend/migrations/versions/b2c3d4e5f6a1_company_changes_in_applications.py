"""company changes in applications: companies table, company_name column

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-03-22 00:00:00.000000

Creates the companies table with a Snowflake BigInteger PK (no SERIAL),
seeds the Applika.dev placeholder company, renames applications.company
to company_name, and adds a nullable company_id FK to applications.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================
    # Step 1 — Create companies table (BigInteger PK, no sequence)
    # =========================================================
    op.create_table(
        'companies',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('url', sa.String(2083), nullable=False),
        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),
        ),
        sa.Column('created_by', sa.BigInteger(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['created_by'],
            ['users.id'],
            name='fk_companies_created_by',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_companies'),
    )
    op.create_index(
        'uq_companies_name_url',
        'companies',
        [sa.text('lower(name)'), 'url'],
        unique=True,
    )

    # =========================================================
    # Step 2 — Seed the Applika.dev placeholder company
    # =========================================================
    op.bulk_insert(
        sa.table(
            'companies',
            sa.column('id', sa.BigInteger),
            sa.column('name', sa.String),
            sa.column('url', sa.String),
            sa.column('is_active', sa.Boolean),
            sa.column('created_at', sa.DateTime(timezone=True)),
        ),
        [
            {
                'id': generate_snowflake_id(),
                'name': 'Applika.dev',
                'url': 'https://applika.dev',
                'is_active': False,
                'created_at': datetime.now(timezone.utc),
            }
        ],
    )

    # =========================================================
    # Step 3 — Rename applications.company → company_name
    # =========================================================
    op.alter_column(
        'applications', 'company', new_column_name='company_name'
    )

    # =========================================================
    # Step 4 — Add nullable company_id FK to applications
    # =========================================================
    op.add_column(
        'applications',
        sa.Column('company_id', sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        'fk_applications_company_id',
        'applications',
        'companies',
        ['company_id'],
        ['id'],
    )


def downgrade() -> None:
    # =========================================================
    # Step 1 — Drop company_id FK and column
    # =========================================================
    op.drop_constraint(
        'fk_applications_company_id', 'applications', type_='foreignkey'
    )
    op.drop_column('applications', 'company_id')

    # =========================================================
    # Step 2 — Rename company_name back to company
    # =========================================================
    op.alter_column(
        'applications', 'company_name', new_column_name='company'
    )

    # =========================================================
    # Step 3 — Drop companies table (index dropped automatically)
    # =========================================================
    op.drop_index('uq_companies_name_url', table_name='companies')
    op.drop_table('companies')
