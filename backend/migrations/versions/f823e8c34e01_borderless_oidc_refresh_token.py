"""borderless refresh token, retire the access token columns to _old

Revision ID: f823e8c34e01
Revises: 4d3bbb20127f
Create Date: 2026-11-06 22:04:38.000000

Plan ``docs/plan/0020-borderless-oidc-sign-in.md`` ``## Data``, ADR-0026
(Sign in with Borderless through OpenID Connect) §6 and §9: Borderless's
OpenID Connect sign-in hands applika a refresh token, which lives only in
the database, Fernet-encrypted; the access token never enters the database
again (it lives encrypted in Redis for its own lifetime), so the two
columns that held the password-era access token are retired.

## What upgrade() does

* ``borderless_accounts.encrypted_refresh_token`` ``TEXT NULL``: renamed
  back from ``encrypted_refresh_token_old`` when this revision's own
  downgrade left it (its rows kept), else added.
* ``borderless_accounts.encrypted_access_token`` becomes
  ``encrypted_access_token_old`` and ``access_token_expires_at`` becomes
  ``access_token_expires_at_old``; both lose ``NOT NULL`` (no code reads or
  writes them, and a new binding writes neither).
* Nothing is copied: a password-era access token cannot become a refresh
  token. Old rows keep their values in the ``_old`` columns and get a NULL
  refresh token; the code treats that binding like a refused grant at its
  first membership check.
* ``ck_user_sessions_end_reason`` is re-created with ``borderless_revoked``
  (18 characters, fits ``VARCHAR(20)``): the web sessions Borderless's
  refusal ends.

No other column, no index.

## What downgrade() does

``end_reason = 'borderless_revoked'`` becomes ``revoked`` and the CHECK
narrows back. Rows with a NULL ``encrypted_access_token_old`` (bindings made
by OpenID Connect sign-in) get ``''`` and
``access_token_expires_at_old = linked_at``, so the parent's code reads them
as expired; then both columns are ``NOT NULL`` again and take their
original names. ``encrypted_refresh_token`` becomes
``encrypted_refresh_token_old``, kept for the re-upgrade.

## Release

Ships with its code (expand-first exception, plan ``## Release``, accepted
by the owner on 2026-11-06): production runs code that the parent revision
already breaks, and OpenID Connect sign-in needs this revision.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real. Rule 2: ``upgrade()`` drops no column and
no table. Rule 3: each retired column takes the ``_old`` suffix. Rule 5:
``downgrade()`` renames the ``_old`` columns back with their values, and the
refresh token is renamed ``_old`` rather than dropped. Rule 6: nothing
shrinks (both retired columns keep their types; ``borderless_revoked`` fits
``end_reason``'s ``VARCHAR(20)``). Rule 7: no ORM model maps an ``_old``
column. Rule 8: the CHECK swap remaps ``borderless_revoked`` to ``revoked``
on the way down and deletes no row. ADR-0005 (non-destructive migrations).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f823e8c34e01'
down_revision: Union[str, Sequence[str], None] = '4d3bbb20127f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ACCOUNTS = 'borderless_accounts'
REFRESH_TOKEN = 'encrypted_refresh_token'
REFRESH_TOKEN_OLD = f'{REFRESH_TOKEN}_old'
ACCESS_TOKEN = 'encrypted_access_token'
ACCESS_EXPIRES = 'access_token_expires_at'
# (column, type) - the password-era columns this revision retires.
RETIRED_COLUMNS: tuple[tuple[str, sa.types.TypeEngine], ...] = (
    (ACCESS_TOKEN, sa.Text()),
    (ACCESS_EXPIRES, sa.DateTime(timezone=True)),
)

SESSIONS = 'user_sessions'
END_REASON_CHECK = 'ck_user_sessions_end_reason'
END_REASONS_PARENT = (
    'end_reason IN '
    "('logout', 'revoked', 'expired', 'github_revoked', 'replaced')"
)
END_REASONS = (
    'end_reason IN '
    "('logout', 'revoked', 'expired', 'github_revoked', 'replaced', "
    "'borderless_revoked')"
)


def _column_names(bind: sa.engine.Connection, table: str) -> set[str]:
    return {column['name'] for column in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    # The refresh token: re-adopt the copy this revision's downgrade left,
    # with its rows, else add the column.
    if REFRESH_TOKEN_OLD in _column_names(bind, ACCOUNTS):
        op.alter_column(
            ACCOUNTS,
            REFRESH_TOKEN_OLD,
            new_column_name=REFRESH_TOKEN,
            existing_type=sa.Text(),
            existing_nullable=True,
        )
    else:
        op.add_column(
            ACCOUNTS, sa.Column(REFRESH_TOKEN, sa.Text(), nullable=True)
        )

    # Retire the access token columns: rename, never drop; every value
    # stays. Nullable, because no new binding writes them.
    for column, type_ in RETIRED_COLUMNS:
        op.alter_column(
            ACCOUNTS,
            column,
            existing_type=type_,
            existing_nullable=False,
            nullable=True,
        )
        op.alter_column(
            ACCOUNTS,
            column,
            new_column_name=f'{column}_old',
            existing_type=type_,
            existing_nullable=True,
        )

    # Replace the CHECK with the wider list (a constraint, no data).
    op.drop_constraint(END_REASON_CHECK, SESSIONS, type_='check')
    op.create_check_constraint(END_REASON_CHECK, SESSIONS, END_REASONS)


def downgrade() -> None:
    bind = op.get_bind()

    # The parent schema has no ``borderless_revoked``: those web sessions
    # read ``revoked`` (the Devices list showed them so already).
    bind.execute(
        sa.text(
            f"UPDATE {SESSIONS} SET end_reason = 'revoked' "
            "WHERE end_reason = 'borderless_revoked'"
        )
    )
    op.drop_constraint(END_REASON_CHECK, SESSIONS, type_='check')
    op.create_check_constraint(END_REASON_CHECK, SESSIONS, END_REASONS_PARENT)

    # Bindings made by OpenID Connect sign-in carry no access token: give
    # them an empty one that expired when they were linked, so the parent's
    # NOT NULL holds and its code reads them as expired.
    bind.execute(
        sa.text(
            f'UPDATE {ACCOUNTS} SET '
            f"{ACCESS_TOKEN}_old = COALESCE({ACCESS_TOKEN}_old, ''), "
            f'{ACCESS_EXPIRES}_old = '
            f'COALESCE({ACCESS_EXPIRES}_old, linked_at) '
            f'WHERE {ACCESS_TOKEN}_old IS NULL '
            f'OR {ACCESS_EXPIRES}_old IS NULL'
        )
    )
    for column, type_ in reversed(RETIRED_COLUMNS):
        op.alter_column(
            ACCOUNTS,
            f'{column}_old',
            new_column_name=column,
            existing_type=type_,
            existing_nullable=True,
        )
        op.alter_column(
            ACCOUNTS,
            column,
            existing_type=type_,
            existing_nullable=True,
            nullable=False,
        )

    # Rename, never drop: the refresh tokens stay for the re-upgrade.
    op.alter_column(
        ACCOUNTS,
        REFRESH_TOKEN,
        new_column_name=REFRESH_TOKEN_OLD,
        existing_type=sa.Text(),
        existing_nullable=True,
    )
