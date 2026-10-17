"""job board tables, applications.job_id, source platforms (Release A, KODI-044)

Revision ID: b28d5134631f
Revises: 3b78c3cd2a71
Create Date: 2026-10-12 10:00:00.000000

Plan ``docs/plan/0012-job-board-fit-and-keyword-tailoring.md``
``## Data`` (S2): five new tables and one new column, every id a snowflake
``BIGINT`` with no sequence (ADR-0003), every table carrying ``created_at`` /
``updated_at`` exactly like the other tables.

* ``job_sources`` - the shared catalog of job boards (no owner). Seeded with
  ``himalayas`` / "Himalayas" / ``https://himalayas.app`` and ``remoteok`` /
  "RemoteOK" / ``https://remoteok.com``. Each source points at a platform
  every user sees (R-019): the public platform with the same ``lower(name)``
  (lowest id) is reused, else a new public platform is inserted
  (``created_by`` NULL, ``url`` = the source's ``base_url``).
* ``jobs`` - shared postings, one per ``(source_id, external_id)``.
* ``job_fit_scores`` - per user, per base CV, per job; ``score`` 0..100.
* ``job_dismissals`` - one per ``(user_id, job_id)``.
* ``saved_job_searches`` - one name per user, ignoring case.
* ``applications.job_id`` - nullable FK ``jobs.id ON DELETE SET NULL``, at most
  one application per user per job (partial unique index, NULLs free).

This is Release A: migration only (``prod-release-runbook.md`` rule 4,
"expand first"). Every object above is new and nullable/defaulted, so the
code already in production keeps working on this schema: an ``INSERT INTO
applications`` that never names ``job_id`` lands NULL. ``app/`` maps none of
these objects; the worker, ingestion, APIs and ORM mapping ship in Release B
(ADR-0016, the ingestion worker), only once the owner confirms
``alembic upgrade head`` ran in production.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real - it drops this revision's own five indexes
and renames every new object to ``*_old``. Rule 2: ``upgrade()`` never drops a
column or a table. Rule 3: on downgrade the five tables become
``job_sources_old``, ``jobs_old``, ``job_fit_scores_old``,
``job_dismissals_old``, ``saved_job_searches_old`` and ``applications.job_id``
becomes ``job_id_old``; every row stays. Rule 5: a later upgrade renames each
``*_old`` object back instead of creating a fresh one, so nothing a user wrote
while the feature was live is lost by a rollback/roll-forward cycle (same
re-adoption ``3b78c3cd2a71`` does). Rule 7: no ORM model maps any of these
objects, ``*_old`` or not. ADR-0005 (non-destructive migrations) is the ADR
this follows.

## What downgrade() keeps

PKs, FKs, CHECKs and the table-level UNIQUE constraints (``uq_job_sources_code``,
``uq_jobs_source_external``, ``uq_job_fit_scores_cv_job``,
``uq_job_dismissals_user_job``) travel with the renamed tables - Postgres
constraints follow a rename - so the ``*_old`` rows keep their integrity and
the re-upgrade's ``ON CONFLICT (code)`` seed has its arbiter. The indexes this
revision created with ``create_index`` (``ix_jobs_active_posted``,
``ix_jobs_tags``, ``ix_job_fit_scores_user_job``,
``uq_saved_job_searches_user_name``, ``uq_applications_user_job``) are
dropped; the re-upgrade recreates them. The platforms the seed reused or
inserted stay: they are ordinary public platforms, ``/supports`` already
lists them, and an application may already point at one.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.lib.types import generate_snowflake_id

revision: str = 'b28d5134631f'
down_revision: Union[str, Sequence[str], None] = '3b78c3cd2a71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES: tuple[str, ...] = (
    'job_sources',
    'jobs',
    'job_fit_scores',
    'job_dismissals',
    'saved_job_searches',
)

SEED_SOURCES: tuple[tuple[str, str, str], ...] = (
    ('himalayas', 'Himalayas', 'https://himalayas.app'),
    ('remoteok', 'RemoteOK', 'https://remoteok.com'),
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    ]


def _id_column() -> sa.Column:
    return sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False)


def _create_job_sources() -> None:
    op.create_table(
        'job_sources',
        _id_column(),
        *_timestamps(),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column('platform_id', sa.BigInteger(), nullable=True),
        sa.Column(
            'is_enabled',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),
        ),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_status', sa.String(20), nullable=True),
        sa.Column('last_run_error', sa.Text(), nullable=True),
        sa.Column('last_run_found', sa.Integer(), nullable=True),
        sa.Column('last_run_saved', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_job_sources'),
        sa.UniqueConstraint('code', name='uq_job_sources_code'),
        sa.ForeignKeyConstraint(
            ['platform_id'],
            ['platforms.id'],
            name='fk_job_sources_platform_id',
            ondelete='SET NULL',
        ),
        sa.CheckConstraint(
            "last_run_status IN ('ok', 'failed', 'blocked')",
            name='ck_job_sources_last_run_status',
        ),
    )


def _create_jobs() -> None:
    op.create_table(
        'jobs',
        _id_column(),
        *_timestamps(),
        sa.Column('source_id', sa.BigInteger(), nullable=False),
        sa.Column('external_id', sa.String(500), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('company_name', sa.String(300), nullable=False),
        sa.Column('company_url', sa.String(2083), nullable=True),
        sa.Column(
            'location_text',
            sa.String(300),
            nullable=False,
            server_default=sa.text("'Remote'"),
        ),
        sa.Column('job_url', sa.String(2083), nullable=False),
        sa.Column('description_text', sa.Text(), nullable=False),
        sa.Column('employment_type', sa.String(100), nullable=True),
        sa.Column('salary_text', sa.String(200), nullable=True),
        sa.Column(
            'tags',
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            'keywords',
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true'),
        ),
        sa.PrimaryKeyConstraint('id', name='pk_jobs'),
        sa.ForeignKeyConstraint(
            ['source_id'],
            ['job_sources.id'],
            name='fk_jobs_source_id',
            ondelete='RESTRICT',
        ),
        sa.UniqueConstraint(
            'source_id', 'external_id', name='uq_jobs_source_external'
        ),
    )


def _create_job_fit_scores() -> None:
    op.create_table(
        'job_fit_scores',
        _id_column(),
        *_timestamps(),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('job_id', sa.BigInteger(), nullable=False),
        sa.Column('base_cv_id', sa.BigInteger(), nullable=False),
        sa.Column('score', sa.SmallInteger(), nullable=False),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_job_fit_scores'),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_job_fit_scores_user_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['job_id'],
            ['jobs.id'],
            name='fk_job_fit_scores_job_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['base_cv_id'],
            ['base_cvs.id'],
            name='fk_job_fit_scores_base_cv_id',
            ondelete='CASCADE',
        ),
        sa.CheckConstraint(
            'score BETWEEN 0 AND 100', name='ck_job_fit_scores_score'
        ),
        sa.UniqueConstraint(
            'base_cv_id', 'job_id', name='uq_job_fit_scores_cv_job'
        ),
    )


def _create_job_dismissals() -> None:
    op.create_table(
        'job_dismissals',
        _id_column(),
        *_timestamps(),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('job_id', sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_job_dismissals'),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_job_dismissals_user_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['job_id'],
            ['jobs.id'],
            name='fk_job_dismissals_job_id',
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint(
            'user_id', 'job_id', name='uq_job_dismissals_user_job'
        ),
    )


def _create_saved_job_searches() -> None:
    op.create_table(
        'saved_job_searches',
        _id_column(),
        *_timestamps(),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('filters', postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_saved_job_searches'),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_saved_job_searches_user_id',
            ondelete='CASCADE',
        ),
    )


_CREATORS = {
    'job_sources': _create_job_sources,
    'jobs': _create_jobs,
    'job_fit_scores': _create_job_fit_scores,
    'job_dismissals': _create_job_dismissals,
    'saved_job_searches': _create_saved_job_searches,
}


def _index_names(bind: sa.engine.Connection, table: str) -> set[str]:
    return {
        name
        for ix in sa.inspect(bind).get_indexes(table)
        if (name := ix['name']) is not None
    }


def _create_indexes(bind: sa.engine.Connection) -> None:
    if 'ix_jobs_active_posted' not in _index_names(bind, 'jobs'):
        op.create_index(
            'ix_jobs_active_posted',
            'jobs',
            ['is_active', sa.text('posted_at DESC')],
        )
    if 'ix_jobs_tags' not in _index_names(bind, 'jobs'):
        op.create_index(
            'ix_jobs_tags', 'jobs', ['tags'], postgresql_using='gin'
        )
    if 'ix_job_fit_scores_user_job' not in _index_names(bind, 'job_fit_scores'):
        op.create_index(
            'ix_job_fit_scores_user_job',
            'job_fit_scores',
            ['user_id', 'job_id'],
        )
    if 'uq_saved_job_searches_user_name' not in _index_names(
        bind, 'saved_job_searches'
    ):
        op.create_index(
            'uq_saved_job_searches_user_name',
            'saved_job_searches',
            ['user_id', sa.text('lower(name)')],
            unique=True,
        )
    if 'uq_applications_user_job' not in _index_names(bind, 'applications'):
        op.create_index(
            'uq_applications_user_job',
            'applications',
            ['user_id', 'job_id'],
            unique=True,
            postgresql_where=sa.text('job_id IS NOT NULL'),
        )


def _source_platform_id(
    bind: sa.engine.Connection, name: str, base_url: str, now: datetime
) -> int:
    """The public platform with the same ``lower(name)`` (lowest id), else a
    new public one (R-019, the owner's "A visible platform with the same
    name, ignoring case, is reused")."""
    existing = bind.execute(
        sa.text(
            'SELECT id FROM platforms '
            'WHERE is_public AND lower(name) = lower(:name) '
            'ORDER BY id LIMIT 1'
        ),
        {'name': name},
    ).scalar()
    if existing is not None:
        return int(existing)
    platform_id = generate_snowflake_id()
    bind.execute(
        sa.text(
            'INSERT INTO platforms '
            '(id, name, url, is_public, created_by, created_at) '
            'VALUES (:id, :name, :url, true, NULL, :now)'
        ),
        {'id': platform_id, 'name': name, 'url': base_url, 'now': now},
    )
    return platform_id


def _seed_sources(bind: sa.engine.Connection) -> None:
    now = datetime.now(timezone.utc)
    for code, name, base_url in SEED_SOURCES:
        bind.execute(
            sa.text(
                'INSERT INTO job_sources '
                '(id, code, name, base_url, created_at) '
                'VALUES (:id, :code, :name, :base_url, :now) '
                'ON CONFLICT (code) DO NOTHING'
            ),
            {
                'id': generate_snowflake_id(),
                'code': code,
                'name': name,
                'base_url': base_url,
                'now': now,
            },
        )
        current = bind.execute(
            sa.text('SELECT platform_id FROM job_sources WHERE code = :code'),
            {'code': code},
        ).scalar()
        if current is not None:
            continue
        bind.execute(
            sa.text(
                'UPDATE job_sources SET platform_id = :platform_id '
                'WHERE code = :code'
            ),
            {
                'platform_id': _source_platform_id(bind, name, base_url, now),
                'code': code,
            },
        )


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    # Dependency order: job_sources before jobs before the three tables that
    # reference jobs. A ``*_old`` twin left by this revision's own downgrade
    # is renamed back (rows, PK, FKs, CHECKs and UNIQUEs travel with it).
    for table in NEW_TABLES:
        if f'{table}_old' in tables:
            op.rename_table(f'{table}_old', table)
        else:
            _CREATORS[table]()

    application_columns = {
        c['name'] for c in sa.inspect(bind).get_columns('applications')
    }
    if 'job_id_old' in application_columns:
        op.alter_column(
            'applications',
            'job_id_old',
            new_column_name='job_id',
            existing_type=sa.BigInteger(),
            existing_nullable=True,
        )
    else:
        op.add_column(
            'applications',
            sa.Column('job_id', sa.BigInteger(), nullable=True),
        )
        op.create_foreign_key(
            'fk_applications_job_id',
            'applications',
            'jobs',
            ['job_id'],
            ['id'],
            ondelete='SET NULL',
        )

    _create_indexes(bind)
    _seed_sources(bind)


def downgrade() -> None:
    # The indexes this revision created; the re-upgrade recreates them.
    op.drop_index('uq_applications_user_job', table_name='applications')
    op.drop_index(
        'uq_saved_job_searches_user_name', table_name='saved_job_searches'
    )
    op.drop_index('ix_job_fit_scores_user_job', table_name='job_fit_scores')
    op.drop_index('ix_jobs_tags', table_name='jobs')
    op.drop_index('ix_jobs_active_posted', table_name='jobs')

    # Rename, never drop: every row stays. The FK fk_applications_job_id
    # follows the column to job_id_old and the jobs table to jobs_old.
    op.alter_column(
        'applications',
        'job_id',
        new_column_name='job_id_old',
        existing_type=sa.BigInteger(),
        existing_nullable=True,
    )
    for table in reversed(NEW_TABLES):
        op.rename_table(table, f'{table}_old')

    # The seeded/reused platforms stay (plan 0012 ``## Data``).
