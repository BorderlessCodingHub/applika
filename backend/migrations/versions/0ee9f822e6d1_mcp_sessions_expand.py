"""mcp sessions expand: user_sessions.scope, mcp / mcp_token, scope pair

Revision ID: 0ee9f822e6d1
Revises: f823e8c34e01
Create Date: 2026-11-14 10:00:00.000000

Plan ``docs/plan/0023-retire-cli-for-mcp.md`` ``## Data`` (release A),
ADR-0028 (Retire the CLI for a hosted MCP server): each MCP token carries a
scope set fixed at creation, stored in the new nullable
``user_sessions.scope`` (space-separated scope names, RFC 6749 section 3.3
style) and mirrored in the session's Redis hash by the release B code.

## What upgrade() does

* ``user_sessions.scope`` ``VARCHAR(255) NULL``: renamed back from
  ``scope_old`` when this revision's own downgrade left it, else added.
  NULL on every ``web`` and ``cli`` row. No CHECK on its values: the set is
  open, a later scope is a new name in code with no migration, and no
  existing token changes.
* ``ck_user_sessions_client_type`` is re-created with ``mcp`` (3
  characters, fits ``VARCHAR(10)``).
* ``ck_user_sessions_sign_in_method`` is re-created with ``mcp_token`` (9
  characters, fits ``VARCHAR(20)``).
* ``ck_user_sessions_mcp_scope`` (new):
  ``(client_type = 'mcp') = (scope IS NOT NULL)``; an MCP token always has
  a scope, a web or CLI session never has one.

No table, no index (``ix_user_sessions_open`` serves the lists). The
``user_sessions.user_id`` FK keeps ``ON DELETE CASCADE``.

## What downgrade() does

Guard first: when any row has ``client_type = 'mcp'`` or
``sign_in_method = 'mcp_token'`` the parent schema cannot hold it, so
``downgrade()`` raises ``RuntimeError`` and changes nothing; from then on
this revision is forward-only (like ``d9e0b46dd7e1``). The guard also counts
``mcp_token`` because the CHECKs do not pair the two columns: a ``web`` row
signed in by ``mcp_token`` would fail the restored sign-in CHECK halfway
through.

Otherwise ``ck_user_sessions_mcp_scope`` goes, ``scope`` becomes
``scope_old`` (every value NULL, since the pair CHECK held), and both CHECKs
take back their ``f823e8c34e01`` definitions.

## Release

Release A: migration only (``prod-release-runbook.md`` rule 4, "expand
first"). The nullable column and the wider CHECKs leave the code already in
production working: nothing in ``app/`` maps, reads or writes ``scope``,
``mcp`` or ``mcp_token``. ADR-0028: the code that uses them ships in
release B, once ``alembic upgrade head`` ran in production.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real. Rule 2: ``upgrade()`` drops no column and
no table. Rule 3: the column this revision adds is retired on downgrade as
``scope_old``. Rule 5: a later upgrade renames ``scope_old`` back with its
values. Rule 6: nothing shrinks. Rule 7: no ORM model maps ``scope_old``.
Rule 8: the CHECK swaps only add values on the way up; the way down deletes
no row and remaps none, because the guard refuses while a row holds a new
value. ADR-0005 (non-destructive migrations).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0ee9f822e6d1'
down_revision: Union[str, Sequence[str], None] = 'f823e8c34e01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SESSIONS = 'user_sessions'
SCOPE = 'scope'
SCOPE_OLD = f'{SCOPE}_old'
SCOPE_TYPE = sa.String(255)

CLIENT_TYPE_CHECK = 'ck_user_sessions_client_type'
CLIENT_TYPES_PARENT = "client_type IN ('web', 'cli')"
CLIENT_TYPES = "client_type IN ('web', 'cli', 'mcp')"

SIGN_IN_CHECK = 'ck_user_sessions_sign_in_method'
SIGN_IN_METHODS_PARENT = (
    "sign_in_method IN ('github_web', 'cli_browser', 'cli_device', "
    "'cli_legacy', 'borderless')"
)
SIGN_IN_METHODS = (
    "sign_in_method IN ('github_web', 'cli_browser', 'cli_device', "
    "'cli_legacy', 'borderless', 'mcp_token')"
)

MCP_SCOPE_CHECK = 'ck_user_sessions_mcp_scope'
MCP_SCOPE = "(client_type = 'mcp') = (scope IS NOT NULL)"


def _column_names(bind: sa.engine.Connection, table: str) -> set[str]:
    return {column['name'] for column in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    # The scope: re-adopt the copy this revision's downgrade left, with its
    # rows, else add the column.
    if SCOPE_OLD in _column_names(bind, SESSIONS):
        op.alter_column(
            SESSIONS,
            SCOPE_OLD,
            new_column_name=SCOPE,
            existing_type=SCOPE_TYPE,
            existing_nullable=True,
        )
    else:
        op.add_column(SESSIONS, sa.Column(SCOPE, SCOPE_TYPE, nullable=True))

    # Replace both CHECKs with the wider lists (constraints, no data).
    op.drop_constraint(CLIENT_TYPE_CHECK, SESSIONS, type_='check')
    op.create_check_constraint(CLIENT_TYPE_CHECK, SESSIONS, CLIENT_TYPES)
    op.drop_constraint(SIGN_IN_CHECK, SESSIONS, type_='check')
    op.create_check_constraint(SIGN_IN_CHECK, SESSIONS, SIGN_IN_METHODS)

    # An MCP token always has a scope; no other session has one.
    op.create_check_constraint(MCP_SCOPE_CHECK, SESSIONS, MCP_SCOPE)


def _refuse_if_mcp_was_used(bind: sa.engine.Connection) -> None:
    mcp_sessions = bind.execute(
        sa.text(
            f'SELECT count(*) FROM {SESSIONS} '
            "WHERE client_type = 'mcp' OR sign_in_method = 'mcp_token'"
        )
    ).scalar_one()
    if mcp_sessions:
        raise RuntimeError(
            f'Refusing to downgrade {revision}: {mcp_sessions} '
            f"{SESSIONS} row(s) with client_type 'mcp' or sign_in_method "
            "'mcp_token' exist; the parent schema holds neither. This "
            'revision is forward-only once an MCP token has been created.'
        )


def downgrade() -> None:
    bind = op.get_bind()
    # Guard first: nothing changes when the parent schema cannot hold the
    # data.
    _refuse_if_mcp_was_used(bind)

    op.drop_constraint(MCP_SCOPE_CHECK, SESSIONS, type_='check')

    # Rename, never drop: the column (all NULL here) stays for the
    # re-upgrade.
    op.alter_column(
        SESSIONS,
        SCOPE,
        new_column_name=SCOPE_OLD,
        existing_type=SCOPE_TYPE,
        existing_nullable=True,
    )

    # Back to the parent's lists; no row holds a value they lack.
    op.drop_constraint(SIGN_IN_CHECK, SESSIONS, type_='check')
    op.create_check_constraint(SIGN_IN_CHECK, SESSIONS, SIGN_IN_METHODS_PARENT)
    op.drop_constraint(CLIENT_TYPE_CHECK, SESSIONS, type_='check')
    op.create_check_constraint(CLIENT_TYPE_CHECK, SESSIONS, CLIENT_TYPES_PARENT)
