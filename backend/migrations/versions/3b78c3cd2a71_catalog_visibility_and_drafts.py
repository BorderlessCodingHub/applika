"""catalog visibility and draft flag columns (Release A, KODI-030)

Revision ID: 3b78c3cd2a71
Revises: 583226ca46bc
Create Date: 2026-09-25 10:00:00.000000

Plan ``docs/applika/plan/0010-application-with-cv-drafts-private-catalogs.md``
``## Data``: ``companies.is_public`` / ``platforms.is_public`` (default
``true``, every existing row public), ``platforms.created_by`` (FK
``users.id`` ``ON DELETE SET NULL``), ``applications.is_draft`` (default
``false``), and the scoped uniqueness ADR-0014's Decision section calls for:
one public company per ``lower(name)`` + ``url``, one private company per
creator per ``lower(name)`` + ``url``, one private platform per creator per
``lower(name)``, no public-platform uniqueness (prod may already hold
duplicate public platform names).

This is Release A: migration only. ``app/`` maps none of these columns yet
(``non-destructive-migrations.md`` rule 7 read the other way around — a
column added ahead of the code that will use it, exactly how
``prod-release-runbook.md`` rule 4 wants an "expand first" migration: the
code that reads ``is_public``/``created_by``/``is_draft`` ships in a later
release, once the owner confirms this revision ran in production). Release B
(K2) adds the ORM mapping, the publish use case and its admin-facing
collision message (R-025/R-026); this revision only proves the schema half —
two private rows with the same name/url are kept, and a duplicate *public*
row is refused by the database itself.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is not empty and not ``pass`` — it renames every new
column back to ``*_old`` and drops the five new indexes. Rule 2:
``upgrade()`` never drops a column or a table — the old
``uq_companies_name_url``/``ix_companies_name_url`` index this revision
replaces is an index, not a column or a table, and non-destructive-migrations
rule 3's ``_old`` suffix is a column/table convention; an index is simply
superseded by the two partial indexes that express the new, narrower
uniqueness (ADR-0014). Rule 7: no ORM model maps ``is_public``,
``created_by`` (on ``platforms``) or ``is_draft`` — ``app/domain/models.py``
is untouched by this ticket, so nothing in ``app/`` reads or writes any of
them.

## What upgrade() does

Adds ``companies.is_public``, ``platforms.is_public`` (``BOOLEAN NOT NULL
server_default true`` — every already-existing row is public, satisfying
ADR-0014's "every row that exists when the migration runs is public").
Adds ``platforms.created_by`` (``BIGINT NULL``,
``fk_platforms_created_by -> users.id ON DELETE SET NULL``,
``ix_platforms_created_by``). Drops whichever of
``uq_companies_name_url``/``ix_companies_name_url`` exists (a re-upgrade
after this revision's own downgrade may have left either one), and creates
``uq_companies_public_name_url`` (``lower(name), url`` where ``is_public``),
``uq_companies_private_owner_name_url`` (``created_by, lower(name), url``
where ``NOT is_public``) and ``uq_platforms_private_owner_name``
(``created_by, lower(name)`` where ``NOT is_public``). Adds
``applications.is_draft`` (``BOOLEAN NOT NULL server_default false``) and
``ix_applications_user_id_drafts`` (``user_id`` where ``is_draft``).

Every column add checks first whether its ``*_old`` twin exists (left behind
by an earlier downgrade of this same revision) and renames it back instead of
adding a fresh column, so a downgrade/upgrade cycle never loses a value a
user wrote after the first upgrade — same rule the retire-and-rename
revisions (``583226ca46bc``) apply the other direction.

## What downgrade() does

Drops the five new indexes, then renames ``applications.is_draft``,
``platforms.created_by``, ``platforms.is_public`` and ``companies.is_public``
to their ``*_old`` names — the FK ``fk_platforms_created_by`` stays in place,
now pointing at ``created_by_old`` (Postgres constraints follow a renamed
column). Finally it rebuilds a single, global company index: when no two
companies collide on ``lower(name)`` + ``url``, it recreates
``uq_companies_name_url`` as a UNIQUE index — this is the pre-feature index,
restored so old code running after a rollback keeps its original
uniqueness guarantee; when a collision exists (users made same-name private
companies while the feature was live), a UNIQUE index would abort the
downgrade, so it creates the non-unique ``ix_companies_name_url`` instead and
logs every colliding group's ids, exactly the choice the owner closed
("Open 2", ADR-0014, 2026-09-25).

ADR-0014 (Accepted 2026-09-25, "Private-until-published catalog rows, and
draft applications hidden from every read model") and
``docs/applika/adr/0005-non-destructive-migrations.md`` are the two ADRs this
revision follows; ``.claude/rules/migration-tests.md`` names the round-trip
test that proves every step above (``test_migration_catalog_visibility_drafts.py``).
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '3b78c3cd2a71'
down_revision: Union[str, Sequence[str], None] = '583226ca46bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(__name__)


def _column_names(
    inspector: sa.engine.reflection.Inspector, table: str
) -> set[str]:
    return {c['name'] for c in inspector.get_columns(table)}


def _index_names(
    inspector: sa.engine.reflection.Inspector, table: str
) -> set[str]:
    return {
        name
        for ix in inspector.get_indexes(table)
        if (name := ix['name']) is not None
    }


def _foreign_key_names(
    inspector: sa.engine.reflection.Inspector, table: str
) -> set[str]:
    return {
        name
        for fk in inspector.get_foreign_keys(table)
        if (name := fk['name']) is not None
    }


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    company_columns = _column_names(inspector, 'companies')
    platform_columns = _column_names(inspector, 'platforms')
    application_columns = _column_names(inspector, 'applications')

    # ---------------------------------------------------------------
    # companies.is_public / platforms.is_public
    # ---------------------------------------------------------------
    if 'is_public_old' in company_columns:
        op.alter_column(
            'companies',
            'is_public_old',
            new_column_name='is_public',
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default='true',
        )
    else:
        op.add_column(
            'companies',
            sa.Column(
                'is_public',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('true'),
            ),
        )

    if 'is_public_old' in platform_columns:
        op.alter_column(
            'platforms',
            'is_public_old',
            new_column_name='is_public',
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default='true',
        )
    else:
        op.add_column(
            'platforms',
            sa.Column(
                'is_public',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('true'),
            ),
        )

    # ---------------------------------------------------------------
    # platforms.created_by + FK + index
    # ---------------------------------------------------------------
    if 'created_by_old' in platform_columns:
        op.alter_column(
            'platforms',
            'created_by_old',
            new_column_name='created_by',
            existing_type=sa.BigInteger(),
            existing_nullable=True,
        )
    else:
        op.add_column(
            'platforms',
            sa.Column('created_by', sa.BigInteger(), nullable=True),
        )

    inspector = sa.inspect(bind)
    if 'fk_platforms_created_by' not in _foreign_key_names(
        inspector, 'platforms'
    ):
        op.create_foreign_key(
            'fk_platforms_created_by',
            'platforms',
            'users',
            ['created_by'],
            ['id'],
            ondelete='SET NULL',
        )

    inspector = sa.inspect(bind)
    if 'ix_platforms_created_by' not in _index_names(inspector, 'platforms'):
        op.create_index('ix_platforms_created_by', 'platforms', ['created_by'])

    # ---------------------------------------------------------------
    # companies uniqueness: drop the old global index, add the two scoped
    # partial ones.
    # ---------------------------------------------------------------
    inspector = sa.inspect(bind)
    company_indexes = _index_names(inspector, 'companies')
    if 'uq_companies_name_url' in company_indexes:
        op.drop_index('uq_companies_name_url', table_name='companies')
    if 'ix_companies_name_url' in company_indexes:
        op.drop_index('ix_companies_name_url', table_name='companies')

    op.create_index(
        'uq_companies_public_name_url',
        'companies',
        [sa.text('lower(name)'), 'url'],
        unique=True,
        postgresql_where=sa.text('is_public'),
    )
    op.create_index(
        'uq_companies_private_owner_name_url',
        'companies',
        ['created_by', sa.text('lower(name)'), 'url'],
        unique=True,
        postgresql_where=sa.text('NOT is_public'),
    )

    # ---------------------------------------------------------------
    # platforms uniqueness: private rows scoped per creator + name only.
    # No public platform index — prod may hold duplicate public names.
    # ---------------------------------------------------------------
    op.create_index(
        'uq_platforms_private_owner_name',
        'platforms',
        ['created_by', sa.text('lower(name)')],
        unique=True,
        postgresql_where=sa.text('NOT is_public'),
    )

    # ---------------------------------------------------------------
    # applications.is_draft + index
    # ---------------------------------------------------------------
    if 'is_draft_old' in application_columns:
        op.alter_column(
            'applications',
            'is_draft_old',
            new_column_name='is_draft',
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default='false',
        )
    else:
        op.add_column(
            'applications',
            sa.Column(
                'is_draft',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('false'),
            ),
        )

    inspector = sa.inspect(bind)
    if 'ix_applications_user_id_drafts' not in _index_names(
        inspector, 'applications'
    ):
        op.create_index(
            'ix_applications_user_id_drafts',
            'applications',
            ['user_id'],
            postgresql_where=sa.text('is_draft'),
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Drop the five new indexes.
    op.drop_index('ix_applications_user_id_drafts', table_name='applications')
    op.drop_index('uq_platforms_private_owner_name', table_name='platforms')
    op.drop_index('uq_companies_private_owner_name_url', table_name='companies')
    op.drop_index('uq_companies_public_name_url', table_name='companies')
    op.drop_index('ix_platforms_created_by', table_name='platforms')

    # Rename the four new columns to *_old. The FK stays on the renamed
    # column (Postgres constraints follow a rename).
    op.alter_column(
        'applications',
        'is_draft',
        new_column_name='is_draft_old',
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default='false',
    )
    op.alter_column(
        'platforms',
        'created_by',
        new_column_name='created_by_old',
        existing_type=sa.BigInteger(),
        existing_nullable=True,
    )
    op.alter_column(
        'platforms',
        'is_public',
        new_column_name='is_public_old',
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default='true',
    )
    op.alter_column(
        'companies',
        'is_public',
        new_column_name='is_public_old',
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default='true',
    )

    # Rebuild a single global company index: UNIQUE when no duplicate
    # (lower(name), url) group exists, else a non-unique index, logging the
    # colliding ids (owner, 2026-09-25, ADR-0014 Decision).
    duplicates = (
        bind
        .execute(
            sa.text(
                'SELECT lower(name) AS lname, url, '
                'array_agg(id ORDER BY id) AS ids '
                'FROM companies '
                'GROUP BY lower(name), url '
                'HAVING count(*) > 1'
            )
        )
        .mappings()
        .all()
    )

    if duplicates:
        for row in duplicates:
            logger.warning(
                'downgrade 3b78c3cd2a71: companies duplicate on '
                'lower(name)=%r url=%r ids=%s — restoring '
                'ix_companies_name_url as a non-unique index instead of '
                'uq_companies_name_url',
                row['lname'],
                row['url'],
                list(row['ids']),
            )
        op.create_index(
            'ix_companies_name_url',
            'companies',
            [sa.text('lower(name)'), 'url'],
            unique=False,
        )
    else:
        op.create_index(
            'uq_companies_name_url',
            'companies',
            [sa.text('lower(name)'), 'url'],
            unique=True,
        )
