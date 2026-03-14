"""applications.company column renamed to old_company

Revision ID: d47505cfb232
Revises: b1d8d288c6e5
Create Date: 2026-03-11 15:20:53.586013

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd47505cfb232'
down_revision: Union[str, Sequence[str], None] = 'b1d8d288c6e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        'applications',
        'company',
        new_column_name='old_company',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        'applications',
        'old_company',
        new_column_name='company',
    )
