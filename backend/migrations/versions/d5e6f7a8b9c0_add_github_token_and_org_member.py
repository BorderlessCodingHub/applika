"""add encrypted_github_token and is_org_member to users

Revision ID: d5e6f7a8b9c0
Revises: c4f8a1b2d3e5
Create Date: 2026-04-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4f8a1b2d3e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'users',
        sa.Column('encrypted_github_token', sa.Text(), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column(
            'is_org_member',
            sa.Boolean(),
            server_default='false',
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'is_org_member')
    op.drop_column('users', 'encrypted_github_token')
