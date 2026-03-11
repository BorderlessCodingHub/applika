"""'companies' table created and company_id FK added to applications

Revision ID: b1d8d288c6e5
Revises: d997fc17b3d3
Create Date: 2026-03-11 13:55:34.661932

"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1d8d288c6e5'
down_revision: Union[str, Sequence[str], None] = 'd997fc17b3d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create the companies table
    op.create_table(
        'companies',
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('url', sa.String(length=2083), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False,
                  server_default=sa.text('true')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column(
            'id', sa.Integer(), autoincrement=True, nullable=False
        ),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ['created_by'], ['users.id'],
            name='fk_companies_created_by',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_companies'),
    )

    # 2. Seed the placeholder company (is_active=false)
    companies_table = sa.table(
        'companies',
        sa.column('name', sa.String),
        sa.column('url', sa.String),
        sa.column('is_active', sa.Boolean),
        sa.column('created_at', sa.DateTime(timezone=True)),
    )
    now = datetime.now(timezone.utc)
    op.bulk_insert(companies_table, [{
        'name': 'applika.dev',
        'url': 'https://www.linkedin.com/company/applika.dev',
        'is_active': False,
        'created_at': now,
    }])

    # 3. Add company_id as nullable first (existing rows need a value)
    op.add_column(
        'applications',
        sa.Column('company_id', sa.Integer(), nullable=True),
    )

    # 4. Set all existing applications to the placeholder company
    op.execute(sa.text("""
        UPDATE applications
        SET company_id = (
            SELECT id FROM companies
            WHERE name = 'applika.dev' LIMIT 1
        )
    """))

    # 5. Make company_id NOT NULL and add the FK
    op.alter_column(
        'applications', 'company_id', nullable=False,
    )
    op.create_foreign_key(
        'fk_applications_company_id',
        'applications', 'companies',
        ['company_id'], ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    # 1. Drop the FK and company_id column
    op.drop_constraint(
        'fk_applications_company_id',
        'applications', type_='foreignkey',
    )
    op.drop_column('applications', 'company_id')

    # 2. Drop the companies table
    op.drop_table('companies')
