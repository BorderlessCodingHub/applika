"""add time fields to application steps

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-12 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'application_steps',
        sa.Column('start_time', sa.Time(), nullable=True),
    )
    op.add_column(
        'application_steps',
        sa.Column('end_time', sa.Time(), nullable=True),
    )
    op.add_column(
        'application_steps',
        sa.Column('timezone', sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('application_steps', 'timezone')
    op.drop_column('application_steps', 'end_time')
    op.drop_column('application_steps', 'start_time')
