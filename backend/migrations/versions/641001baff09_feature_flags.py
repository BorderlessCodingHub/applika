"""feature registry, beta list and admin opt-outs (Release A, KODI-051)

Revision ID: 641001baff09
Revises: b28d5134631f
Create Date: 2026-10-14 10:00:00.000000

Plan ``docs/applika/plan/0013-beta-features.md`` ``## Data`` (S1), ADR-0018
(beta features registry and allowlist): three new tables, every id a
snowflake ``BIGINT`` with no sequence (ADR-0003), every table carrying
``created_at`` / ``updated_at`` exactly like the other tables.

* ``features`` - the list of features. ``key`` is unique
  (``uq_features_key``); ``stage`` is ``beta`` or ``general``
  (``ck_features_stage``, default ``beta``); ``released_at`` is NULL until a
  feature goes general.
* ``feature_beta_users`` - the per-feature beta list, one row per
  ``(feature_id, user_id)`` (``uq_feature_beta_users_feature_user``).
  ``added_by`` is the admin who added the user (``ON DELETE SET NULL``).
* ``feature_admin_opt_outs`` - one row per admin who opted out of a feature,
  ``(feature_id, user_id)`` unique (``uq_feature_admin_opt_outs_feature_user``).
  Its own table, never a flag on the beta list.

Seed: the feature ``jobs`` / "Job board" / "Remote job list, CV fit and
keyword tailoring (PRD 0012)" in ``beta``, ``released_at`` NULL, with no
beta-list row and no opt-out row - so every admin has it and no other user
does until an admin adds them (the rule itself is code, KODI-052).

This is Release A: migration only (``prod-release-runbook.md`` rule 4,
"expand first"). Every object above is a new table, so the code already in
production keeps working on this schema. ``app/`` maps none of these
objects; the ORM models, the access rule and the admin routes ship in
Release B (KODI-052), only once the owner confirms ``alembic upgrade head``
ran in production.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real - it drops this revision's own two indexes
and renames every new table to ``*_old``. Rule 2: ``upgrade()`` never drops a
column or a table. Rule 3: on downgrade the three tables become
``features_old``, ``feature_beta_users_old`` and ``feature_admin_opt_outs_old``;
every row stays. Rule 5: a later upgrade renames each ``*_old`` table back
instead of creating a fresh one, so a beta list or an opt-out written while
the feature was live survives a rollback/roll-forward cycle (same
re-adoption ``3b78c3cd2a71`` and ``b28d5134631f`` do). Rule 7: no ORM model
maps any of these objects, ``*_old`` or not. ADR-0005 (non-destructive
migrations) is the ADR this follows.

## What downgrade() keeps

PKs, FKs, the CHECK and the table-level UNIQUE constraints
(``uq_features_key``, ``uq_feature_beta_users_feature_user``,
``uq_feature_admin_opt_outs_feature_user``) travel with the renamed tables -
Postgres constraints follow a rename - so the ``*_old`` rows keep their
integrity and the re-upgrade's ``ON CONFLICT (key)`` seed has its arbiter.
The indexes this revision created with ``create_index``
(``ix_feature_beta_users_user_id``, ``ix_feature_admin_opt_outs_user_id``)
are dropped; the re-upgrade recreates them.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = '641001baff09'
down_revision: Union[str, Sequence[str], None] = 'b28d5134631f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Dependency order: features before the two tables that reference it.
NEW_TABLES: tuple[str, ...] = (
    'features',
    'feature_beta_users',
    'feature_admin_opt_outs',
)

SEED_FEATURES: tuple[tuple[str, str, str], ...] = (
    (
        'jobs',
        'Job board',
        'Remote job list, CV fit and keyword tailoring (PRD 0012)',
    ),
)

# (index name, table) - the indexes this revision builds with create_index.
CREATED_INDEXES: tuple[tuple[str, str], ...] = (
    ('ix_feature_beta_users_user_id', 'feature_beta_users'),
    ('ix_feature_admin_opt_outs_user_id', 'feature_admin_opt_outs'),
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    ]


def _id_column() -> sa.Column:
    return sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False)


def _create_features() -> None:
    op.create_table(
        'features',
        _id_column(),
        *_timestamps(),
        sa.Column('key', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column(
            'stage',
            sa.String(20),
            nullable=False,
            server_default=sa.text("'beta'"),
        ),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_features'),
        sa.UniqueConstraint('key', name='uq_features_key'),
        sa.CheckConstraint(
            "stage IN ('beta', 'general')", name='ck_features_stage'
        ),
    )


def _create_feature_beta_users() -> None:
    op.create_table(
        'feature_beta_users',
        _id_column(),
        *_timestamps(),
        sa.Column('feature_id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('added_by', sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_feature_beta_users'),
        sa.ForeignKeyConstraint(
            ['feature_id'],
            ['features.id'],
            name='fk_feature_beta_users_feature_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_feature_beta_users_user_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['added_by'],
            ['users.id'],
            name='fk_feature_beta_users_added_by',
            ondelete='SET NULL',
        ),
        sa.UniqueConstraint(
            'feature_id',
            'user_id',
            name='uq_feature_beta_users_feature_user',
        ),
    )


def _create_feature_admin_opt_outs() -> None:
    op.create_table(
        'feature_admin_opt_outs',
        _id_column(),
        *_timestamps(),
        sa.Column('feature_id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_feature_admin_opt_outs'),
        sa.ForeignKeyConstraint(
            ['feature_id'],
            ['features.id'],
            name='fk_feature_admin_opt_outs_feature_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_feature_admin_opt_outs_user_id',
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint(
            'feature_id',
            'user_id',
            name='uq_feature_admin_opt_outs_feature_user',
        ),
    )


_CREATORS = {
    'features': _create_features,
    'feature_beta_users': _create_feature_beta_users,
    'feature_admin_opt_outs': _create_feature_admin_opt_outs,
}


def _index_names(bind: sa.engine.Connection, table: str) -> set[str]:
    return {
        name
        for ix in sa.inspect(bind).get_indexes(table)
        if (name := ix['name']) is not None
    }


def _create_indexes(bind: sa.engine.Connection) -> None:
    for index, table in CREATED_INDEXES:
        if index not in _index_names(bind, table):
            op.create_index(index, table, ['user_id'])


def _seed_features(bind: sa.engine.Connection) -> None:
    now = datetime.now(timezone.utc)
    for key, name, description in SEED_FEATURES:
        bind.execute(
            sa.text(
                'INSERT INTO features '
                '(id, key, name, description, stage, released_at, '
                'created_at) '
                "VALUES (:id, :key, :name, :description, 'beta', NULL, "
                ':now) '
                'ON CONFLICT (key) DO NOTHING'
            ),
            {
                'id': generate_snowflake_id(),
                'key': key,
                'name': name,
                'description': description,
                'now': now,
            },
        )


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    # A ``*_old`` twin left by this revision's own downgrade is renamed back
    # (rows, PK, FKs, CHECK and UNIQUEs travel with it).
    for table in NEW_TABLES:
        if f'{table}_old' in tables:
            op.rename_table(f'{table}_old', table)
        else:
            _CREATORS[table]()

    _create_indexes(bind)
    _seed_features(bind)


def downgrade() -> None:
    # The indexes this revision created; the re-upgrade recreates them.
    for index, table in reversed(CREATED_INDEXES):
        op.drop_index(index, table_name=table)

    # Rename, never drop: every row stays.
    for table in reversed(NEW_TABLES):
        op.rename_table(table, f'{table}_old')
