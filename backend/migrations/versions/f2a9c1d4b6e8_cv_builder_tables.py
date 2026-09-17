"""cv builder tables: base_cvs, tailored_cvs, applications.job_description

Revision ID: f2a9c1d4b6e8
Revises: a1b2c3d4e5f7
Create Date: 2026-09-16 10:00:00.000000

Release A of the CV builder (expand first, code second):
this revision only creates the new structure. No application code reads or
writes these objects yet.

The owner's words: "each job application will store a "copy" of this master
CV but edited to the job application". The copy lives in ``tailored_cvs``,
one per application at most (UNIQUE on ``application_id``), and it dies with
its application (FK ON DELETE CASCADE).

Primary keys are Snowflake BigIntegers generated in Python
(docs/applika/adr/0003-snowflake-string-ids.md): no sequence, no server
default, ``autoincrement=False``.

``upgrade()`` drops nothing. ``downgrade()`` drops only the objects this very
revision created, which is what .claude/rules/non-destructive-migrations.md
points 1 and 5 ask for; nothing pre-existing is retired here, so there is no
``_old`` rename.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'f2a9c1d4b6e8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The CV section columns, shared by base_cvs and tailored_cvs.
# summary is TEXT; the six others are JSONB arrays.
_JSONB_SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'certifications',
    'languages',
)


def _identity_columns() -> list[sa.Column]:
    """Identity + summary + the six JSONB sections, shared by both tables."""
    return [
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('full_name', sa.String(length=200), nullable=False),
        sa.Column('headline', sa.String(length=300), nullable=False),
        sa.Column('location', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column(
            'summary',
            sa.Text(),
            nullable=False,
            server_default=sa.text("''"),
        ),
        *[
            sa.Column(
                section,
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            )
            for section in _JSONB_SECTIONS
        ],
    ]


def upgrade() -> None:
    # -- 1. Create base_cvs table (the master CV, one or more per user)
    op.create_table(
        'base_cvs',
        sa.Column(
            'id', sa.BigInteger(), autoincrement=False, nullable=False
        ),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        *_identity_columns(),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            name='fk_base_cvs_user_id',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_base_cvs'),
    )
    op.create_index('idx_base_cvs_user_id', 'base_cvs', ['user_id'])

    # -- 2. Create tailored_cvs table (the per-application copy).
    #        Full snapshot: it keeps its own identity/summary/sections so it
    #        survives edits to - and deletion of - its base CV.
    op.create_table(
        'tailored_cvs',
        sa.Column(
            'id', sa.BigInteger(), autoincrement=False, nullable=False
        ),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('application_id', sa.BigInteger(), nullable=False),
        sa.Column('base_cv_id', sa.BigInteger(), nullable=True),
        *_identity_columns(),
        sa.Column(
            'was_ai_generated',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
        sa.Column(
            'adjustments',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            name='fk_tailored_cvs_user_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['application_id'], ['applications.id'],
            name='fk_tailored_cvs_application_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['base_cv_id'], ['base_cvs.id'],
            name='fk_tailored_cvs_base_cv_id',
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_tailored_cvs'),
        # At most one CV copy per application.
        sa.UniqueConstraint(
            'application_id', name='uq_tailored_cvs_application_id'
        ),
    )
    op.create_index('idx_tailored_cvs_user_id', 'tailored_cvs', ['user_id'])

    # -- 3. Add applications.job_description (nullable, additive)
    op.add_column(
        'applications',
        sa.Column('job_description', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    # -- Reverse 3. Remove applications.job_description
    op.drop_column('applications', 'job_description')

    # -- Reverse 2. Drop tailored_cvs
    op.drop_index('idx_tailored_cvs_user_id', table_name='tailored_cvs')
    op.drop_table('tailored_cvs')

    # -- Reverse 1. Drop base_cvs
    op.drop_index('idx_base_cvs_user_id', table_name='base_cvs')
    op.drop_table('base_cvs')
