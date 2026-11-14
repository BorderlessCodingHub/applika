"""borderless accounts, GitHub identities, badges and report webhooks (Release A)

Revision ID: d9e0b46dd7e1
Revises: 647a047921ec
Create Date: 2026-10-29 10:00:00.000000

Plan ``docs/plan/0018-borderless-sign-in-and-membership-badges.md``
``## Data`` (A1), ADR-0024 (Borderless as sole login and membership badges)
section 8: the expand half of the move from GitHub sign-in and Discord
roles to Borderless sign-in and membership badges. Every new id is a
snowflake ``BIGINT`` with no sequence (ADR-0003); every new table carries
``created_at`` / ``updated_at`` like the other tables.

New tables:

* ``borderless_accounts`` - one Borderless binding per user
  (``uq_borderless_accounts_user_id``,
  ``uq_borderless_accounts_borderless_user_id``), the encrypted access token
  and its expiry, ``status`` ``active`` or ``needs_reconnect``
  (``ck_borderless_accounts_status``). No refresh-token column.
* ``github_connections`` - the GitHub identity a user signed in with
  (``uq_github_connections_user_id``, ``uq_github_connections_github_id``).
* ``user_badges`` - the membership badges (``borderless_base``,
  ``borderless_psp``) a user holds or held; at most one live row per
  ``(user_id, badge)`` (partial unique index ``uq_user_badges_live`` WHERE
  ``revoked_at IS NULL``); a revoked row stays as history.
* ``report_webhooks`` - the platform's report webhooks, each assigned to a
  badge or to none (``badge`` NULL: the webhook receives nothing).

Seeds (``ON CONFLICT DO NOTHING``, so a re-upgrade tops up):

* one ``github_connections`` row per ``users`` row with a ``github_id``
  (``github_id``, ``username``, ``linked_at = users.created_at``), so a
  later GitHub restore can find every account that signed in with GitHub;
* one ``report_webhooks`` row per ``discord_report_webhooks`` row
  (``url = webhook_url``, ``label``, ``created_at``, ``badge`` NULL).

Existing objects:

* ``users.github_id`` becomes nullable (its unique index stays);
* ``users.github_restore_prompt_seen_at`` (new, nullable);
* ``ck_user_sessions_sign_in_method`` also allows ``borderless``.

This is Release A: migration only (``prod-release-runbook.md`` rule 4,
"expand first"). The new tables, the new nullable column, the nullable
``github_id`` and the wider CHECK leave the code already in production
working. Nothing in ``app/`` maps or reads any of these objects; the code
that uses them ships in Release B, only once the owner confirms
``alembic upgrade head`` ran in production. ``discord_report_webhooks`` and
``users.github_id`` are left untouched here; setting them aside is the
retire revision of Release C.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real. Rule 2: ``upgrade()`` never drops a column
or a table. Rule 3: on downgrade the four tables become ``*_old`` and
``users.github_restore_prompt_seen_at`` becomes
``users.github_restore_prompt_seen_at_old``; every row and value stays.
Rule 5: a later upgrade renames each ``*_old`` object back instead of
creating a fresh one, and tops the seeds up. Rule 6: nothing shrinks -
``report_webhooks.url`` (500) and ``label`` (100) equal
``discord_report_webhooks.webhook_url`` and ``label``, and
``github_connections.username`` (100) equals ``users.username``. Rule 7: no
ORM model maps any of these objects, ``*_old`` or not. ADR-0005
(non-destructive migrations) is the ADR this follows.

## The downgrade guard

Once Borderless sign-in is live a user may exist with no ``github_id`` and
a session may carry ``sign_in_method = 'borderless'``; the parent schema
holds neither. ``downgrade()`` therefore checks first and raises
``RuntimeError`` with both counts, changing nothing, when either exists:
from then on Release A is forward-only.

## What downgrade() keeps

PKs, FKs, CHECKs and table-level UNIQUE constraints travel with the
renamed tables (Postgres constraints follow a rename), so the ``*_old`` rows
keep their integrity and the re-upgrade's ``ON CONFLICT`` seeds have their
arbiters. The indexes this revision built with ``create_index``
(``ix_user_badges_user_id``, ``uq_user_badges_live``) are dropped; the
re-upgrade recreates them only when missing.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = 'd9e0b46dd7e1'
down_revision: Union[str, Sequence[str], None] = '647a047921ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TABLES: tuple[str, ...] = (
    'borderless_accounts',
    'github_connections',
    'user_badges',
    'report_webhooks',
)

BADGES = "('borderless_base', 'borderless_psp')"

PROMPT_COLUMN = 'github_restore_prompt_seen_at'
PROMPT_COLUMN_OLD = f'{PROMPT_COLUMN}_old'

SIGN_IN_CHECK = 'ck_user_sessions_sign_in_method'
SIGN_IN_METHODS_PARENT = (
    "sign_in_method IN ('github_web', 'cli_browser', 'cli_device', "
    "'cli_legacy')"
)
SIGN_IN_METHODS = (
    "sign_in_method IN ('github_web', 'cli_browser', 'cli_device', "
    "'cli_legacy', 'borderless')"
)

INDEX_BADGES_USER = 'ix_user_badges_user_id'
INDEX_BADGES_LIVE = 'uq_user_badges_live'
# (index name, table) - the indexes this revision builds with create_index.
CREATED_INDEXES: tuple[tuple[str, str], ...] = (
    (INDEX_BADGES_USER, 'user_badges'),
    (INDEX_BADGES_LIVE, 'user_badges'),
)


def _id_column() -> sa.Column:
    return sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    ]


def _user_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ['user_id'],
        ['users.id'],
        name=f'fk_{table}_user_id',
        ondelete='CASCADE',
    )


def _create_borderless_accounts() -> None:
    table = 'borderless_accounts'
    op.create_table(
        table,
        _id_column(),
        *_timestamps(),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('borderless_user_id', sa.String(64), nullable=False),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('encrypted_access_token', sa.Text(), nullable=False),
        sa.Column(
            'access_token_expires_at',
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.String(20),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column(
            'linked_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.Column('profile_read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'profile_read_failed_at', sa.DateTime(timezone=True), nullable=True
        ),
        sa.PrimaryKeyConstraint('id', name=f'pk_{table}'),
        _user_fk(table),
        sa.UniqueConstraint('user_id', name=f'uq_{table}_user_id'),
        sa.UniqueConstraint(
            'borderless_user_id', name=f'uq_{table}_borderless_user_id'
        ),
        sa.CheckConstraint(
            "status IN ('active', 'needs_reconnect')",
            name=f'ck_{table}_status',
        ),
    )


def _create_github_connections() -> None:
    table = 'github_connections'
    op.create_table(
        table,
        _id_column(),
        *_timestamps(),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('github_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('linked_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id', name=f'pk_{table}'),
        _user_fk(table),
        sa.UniqueConstraint('user_id', name=f'uq_{table}_user_id'),
        sa.UniqueConstraint('github_id', name=f'uq_{table}_github_id'),
    )


def _create_user_badges() -> None:
    table = 'user_badges'
    op.create_table(
        table,
        _id_column(),
        *_timestamps(),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('badge', sa.String(40), nullable=False),
        sa.Column('source', sa.String(40), nullable=False),
        sa.Column(
            'granted_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name=f'pk_{table}'),
        _user_fk(table),
        sa.CheckConstraint(f'badge IN {BADGES}', name=f'ck_{table}_badge'),
        sa.CheckConstraint(
            "source IN ('borderless')", name=f'ck_{table}_source'
        ),
    )


def _create_report_webhooks() -> None:
    table = 'report_webhooks'
    op.create_table(
        table,
        _id_column(),
        *_timestamps(),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('badge', sa.String(40), nullable=True),
        sa.Column('label', sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint('id', name=f'pk_{table}'),
        sa.UniqueConstraint('url', name=f'uq_{table}_url'),
        sa.CheckConstraint(f'badge IN {BADGES}', name=f'ck_{table}_badge'),
    )


_CREATORS = {
    'borderless_accounts': _create_borderless_accounts,
    'github_connections': _create_github_connections,
    'user_badges': _create_user_badges,
    'report_webhooks': _create_report_webhooks,
}


def _index_names(bind: sa.engine.Connection, table: str) -> set[str]:
    return {
        name
        for ix in sa.inspect(bind).get_indexes(table)
        if (name := ix['name']) is not None
    }


def _create_indexes(bind: sa.engine.Connection) -> None:
    existing = _index_names(bind, 'user_badges')
    if INDEX_BADGES_USER not in existing:
        op.create_index(INDEX_BADGES_USER, 'user_badges', ['user_id'])
    if INDEX_BADGES_LIVE not in existing:
        op.create_index(
            INDEX_BADGES_LIVE,
            'user_badges',
            ['user_id', 'badge'],
            unique=True,
            postgresql_where=sa.text('revoked_at IS NULL'),
        )


def _seed_github_connections(bind: sa.engine.Connection) -> None:
    """One row per user with a GitHub id that has none yet."""
    users = bind.execute(
        sa.text(
            'SELECT u.id, u.github_id, u.username, u.created_at FROM users u '
            'WHERE u.github_id IS NOT NULL AND NOT EXISTS ('
            'SELECT 1 FROM github_connections g '
            'WHERE g.user_id = u.id OR g.github_id = u.github_id) '
            'ORDER BY u.id'
        )
    ).all()
    if not users:
        return
    now = datetime.now(timezone.utc)
    bind.execute(
        sa.text(
            'INSERT INTO github_connections '
            '(id, created_at, user_id, github_id, username, linked_at) '
            'VALUES (:id, :now, :user_id, :github_id, :username, '
            ':linked_at) '
            'ON CONFLICT DO NOTHING'
        ),
        [
            {
                'id': generate_snowflake_id(),
                'now': now,
                'user_id': user_id,
                'github_id': github_id,
                'username': username,
                'linked_at': created_at,
            }
            for user_id, github_id, username, created_at in users
        ],
    )


def _seed_report_webhooks(bind: sa.engine.Connection) -> None:
    """One row per Discord report webhook not carried over yet, badge
    NULL."""
    webhooks = bind.execute(
        sa.text(
            'SELECT d.webhook_url, d.label, d.created_at '
            'FROM discord_report_webhooks d '
            'WHERE NOT EXISTS ('
            'SELECT 1 FROM report_webhooks r WHERE r.url = d.webhook_url) '
            'ORDER BY d.id'
        )
    ).all()
    if not webhooks:
        return
    bind.execute(
        sa.text(
            'INSERT INTO report_webhooks (id, created_at, url, badge, label) '
            'VALUES (:id, :created_at, :url, NULL, :label) '
            'ON CONFLICT DO NOTHING'
        ),
        [
            {
                'id': generate_snowflake_id(),
                'created_at': created_at,
                'url': url,
                'label': label,
            }
            for url, label, created_at in webhooks
        ],
    )


def _column_names(bind: sa.engine.Connection, table: str) -> set[str]:
    return {column['name'] for column in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    # A ``*_old`` twin left by this revision's own downgrade is renamed back
    # (rows, PK, FKs, CHECKs and UNIQUEs travel with it).
    for table in NEW_TABLES:
        if f'{table}_old' in tables:
            op.rename_table(f'{table}_old', table)
        else:
            _CREATORS[table]()
    _create_indexes(bind)

    op.alter_column(
        'users',
        'github_id',
        existing_type=sa.BigInteger(),
        nullable=True,
    )
    if PROMPT_COLUMN_OLD in _column_names(bind, 'users'):
        op.alter_column(
            'users', PROMPT_COLUMN_OLD, new_column_name=PROMPT_COLUMN
        )
    else:
        op.add_column(
            'users',
            sa.Column(PROMPT_COLUMN, sa.DateTime(timezone=True), nullable=True),
        )

    # Replace the CHECK with the wider list (a constraint, no data).
    op.drop_constraint(SIGN_IN_CHECK, 'user_sessions', type_='check')
    op.create_check_constraint(SIGN_IN_CHECK, 'user_sessions', SIGN_IN_METHODS)

    _seed_github_connections(bind)
    _seed_report_webhooks(bind)


def _refuse_if_borderless_was_used(bind: sa.engine.Connection) -> None:
    no_github = bind.execute(
        sa.text('SELECT count(*) FROM users WHERE github_id IS NULL')
    ).scalar_one()
    borderless_sessions = bind.execute(
        sa.text(
            'SELECT count(*) FROM user_sessions '
            "WHERE sign_in_method = 'borderless'"
        )
    ).scalar_one()
    if no_github or borderless_sessions:
        raise RuntimeError(
            f'Refusing to downgrade {revision}: {no_github} user(s) with no '
            f'github_id and {borderless_sessions} user_sessions row(s) with '
            "sign_in_method 'borderless' exist; the parent schema holds "
            'neither. Release A is forward-only once Borderless sign-in '
            'has been used.'
        )


def downgrade() -> None:
    bind = op.get_bind()
    # Guard first: nothing changes when the parent schema cannot hold the
    # data.
    _refuse_if_borderless_was_used(bind)

    op.drop_constraint(SIGN_IN_CHECK, 'user_sessions', type_='check')
    op.create_check_constraint(
        SIGN_IN_CHECK, 'user_sessions', SIGN_IN_METHODS_PARENT
    )

    # Rename, never drop: every value stays.
    op.alter_column('users', PROMPT_COLUMN, new_column_name=PROMPT_COLUMN_OLD)

    # The indexes this revision created; the re-upgrade recreates them.
    for index, table in reversed(CREATED_INDEXES):
        op.drop_index(index, table_name=table)

    # Rename, never drop: every row stays.
    for table in reversed(NEW_TABLES):
        op.rename_table(table, f'{table}_old')

    op.alter_column(
        'users',
        'github_id',
        existing_type=sa.BigInteger(),
        nullable=False,
    )
