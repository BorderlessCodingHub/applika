"""user_sessions: one row per sign-in, kept after it ends (Release A, KODI-056)

Revision ID: ed39a0fad1e5
Revises: 641001baff09
Create Date: 2026-10-15 10:00:00.000000

Plan ``docs/plan/0014-cli-device-sign-in-and-devices.md`` ``## Data``
(Postgres part), ADR-0019 (device sessions and CLI OAuth): one new table,
``user_sessions``. Its id is a snowflake ``BIGINT`` with no sequence
(ADR-0003); it carries ``created_at`` (the moment access was granted) and
``updated_at`` exactly like the other tables.

* ``user_id`` - the owner, ``ON DELETE CASCADE``.
* ``client_type`` - ``web`` or ``cli`` (``ck_user_sessions_client_type``).
* ``sign_in_method`` - ``github_web``, ``cli_browser``, ``cli_device`` or
  ``cli_legacy`` (``ck_user_sessions_sign_in_method``).
* ``device_name``, ``user_agent`` - what the device calls itself.
* ``created_ip``, ``last_ip``, ``last_used_at`` - sign-in IP, last IP and
  last use.
* ``expires_at`` - when the sign-in lapses.
* ``ended_at`` / ``end_reason`` - set together or not at all
  (``ck_user_sessions_ended_pair``); the reason is ``logout``, ``revoked``,
  ``expired``, ``github_revoked`` or ``replaced``
  (``ck_user_sessions_end_reason``). An ended row stays, so ended devices
  remain visible in the history.

No refresh token and no hash of it is stored here (ADR-0019: the live key
lives in Redis). Two indexes: ``ix_user_sessions_user_id_created_at``
``(user_id, created_at DESC)`` for the device list, and the partial
``ix_user_sessions_open`` ``(user_id) WHERE ended_at IS NULL`` for the open
sessions.

This is Release A: migration only (``prod-release-runbook.md`` rule 4,
"expand first"). The table is new, so the code already in production keeps
working on this schema. ``app/`` maps none of it; the ORM model, Redis and
the routes ship in Release B (KODI-057), only once the owner confirms
``alembic upgrade head`` ran in production.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real - it drops this revision's own two indexes
and renames ``user_sessions`` to ``user_sessions_old``. Rule 2: ``upgrade()``
never drops a column or a table. Rule 3: on downgrade the table becomes
``user_sessions_old``; every row stays (owner-approved plan correction 1:
rename, never ``drop_table``). Rule 5: a later upgrade renames
``user_sessions_old`` back instead of creating a fresh table, so the device
history survives a rollback/roll-forward cycle (same re-adoption as
``641001baff09``). Rule 7: no ORM model maps ``user_sessions`` or
``user_sessions_old``. ADR-0005 (non-destructive migrations) is the ADR this
follows.

## What downgrade() keeps

The PK, the FK and the four CHECK constraints travel with the renamed table -
Postgres constraints follow a rename. The two indexes this revision created
with ``create_index`` are dropped; the re-upgrade recreates them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'ed39a0fad1e5'
down_revision: Union[str, Sequence[str], None] = '641001baff09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = 'user_sessions'
OLD_TABLE = f'{TABLE}_old'

INDEX_USER_CREATED = 'ix_user_sessions_user_id_created_at'
INDEX_OPEN = 'ix_user_sessions_open'
CREATED_INDEXES: tuple[str, ...] = (INDEX_USER_CREATED, INDEX_OPEN)


def _create_user_sessions() -> None:
    op.create_table(
        TABLE,
        sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('client_type', sa.String(10), nullable=False),
        sa.Column('sign_in_method', sa.String(20), nullable=False),
        sa.Column('device_name', sa.String(100), nullable=False),
        sa.Column('user_agent', sa.String(512), nullable=True),
        sa.Column('created_ip', sa.String(45), nullable=True),
        sa.Column('last_ip', sa.String(45), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_reason', sa.String(20), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_user_sessions'),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_user_sessions_user_id',
            ondelete='CASCADE',
        ),
        sa.CheckConstraint(
            "client_type IN ('web', 'cli')",
            name='ck_user_sessions_client_type',
        ),
        sa.CheckConstraint(
            'sign_in_method IN '
            "('github_web', 'cli_browser', 'cli_device', 'cli_legacy')",
            name='ck_user_sessions_sign_in_method',
        ),
        sa.CheckConstraint(
            'end_reason IN '
            "('logout', 'revoked', 'expired', 'github_revoked', 'replaced')",
            name='ck_user_sessions_end_reason',
        ),
        sa.CheckConstraint(
            '(ended_at IS NULL) = (end_reason IS NULL)',
            name='ck_user_sessions_ended_pair',
        ),
    )


def _create_indexes(bind: sa.engine.Connection) -> None:
    existing = {
        name
        for ix in sa.inspect(bind).get_indexes(TABLE)
        if (name := ix['name']) is not None
    }
    if INDEX_USER_CREATED not in existing:
        op.create_index(
            INDEX_USER_CREATED,
            TABLE,
            ['user_id', sa.text('created_at DESC')],
        )
    if INDEX_OPEN not in existing:
        op.create_index(
            INDEX_OPEN,
            TABLE,
            ['user_id'],
            postgresql_where=sa.text('ended_at IS NULL'),
        )


def upgrade() -> None:
    bind = op.get_bind()

    # A ``user_sessions_old`` left by this revision's own downgrade is
    # renamed back (rows, PK, FK and CHECKs travel with it).
    if OLD_TABLE in set(sa.inspect(bind).get_table_names()):
        op.rename_table(OLD_TABLE, TABLE)
    else:
        _create_user_sessions()

    _create_indexes(bind)


def downgrade() -> None:
    # The indexes this revision created; the re-upgrade recreates them.
    for index in reversed(CREATED_INDEXES):
        op.drop_index(index, table_name=TABLE)

    # Rename, never drop: every row stays.
    op.rename_table(TABLE, OLD_TABLE)
