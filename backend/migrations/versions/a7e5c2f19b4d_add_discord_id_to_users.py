"""users.discord_id: a nullable, uniquely-indexed Discord user id foundation
for account linking (R-004, R-007 schema level, KODI-019, plan 0009 K1).

Revision ID: a7e5c2f19b4d
Revises: c1d9f4a7b3e6
Create Date: 2026-09-24 00:00:00.000000

Plan: docs/applika/plan/0009-discord-account-link.md ``## Data``; tasks
docs/applika/plan/0009-discord-account-link.tasks.md K1 T001/T002. The
owner: "Keep github login but add an option in user profile to sincronize
with discord."

## What this revision does

Purely additive: one nullable ``BigInteger`` column, ``users.discord_id``,
plus a unique index ``ix_users_discord_id`` on it. No token column — the
plan is explicit that Applika stores the Discord user id and nothing else
from Discord; no Discord token is ever persisted. Nothing else in the
schema changes and nothing is renamed or dropped.

``downgrade()`` drops only the index and the column this revision added —
there is no ``_old`` object to rename back, because nothing here retires an
existing object (rule 3 of ``non-destructive-migrations.md`` only applies
to a *retired* object; this migration retires nothing).

## prod-release-runbook.md rule 4 (expand first, code second)

This is Release A of plan 0009: the migration only. No application code in
this release reads or writes ``discord_id`` — the ORM does not map the
column (that lands in K2/KODI-020, a later release). The new API image from
this release keeps running against the schema it already knows; the owner
runs ``alembic upgrade head`` by hand afterwards, at their own pace, with
no code depending on the new column in the gap.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` works, it is not empty and not ``pass``. Rule 2:
``upgrade()`` drops nothing. Rule 3: not applicable — no object is retired.
Rule 4: not applicable — no data moves. Rule 6: not applicable — no column
shrinks. Rule 7: ``app/`` never reads or writes an ``_old`` object — this
revision creates none. Rule 8: not applicable — no enum changes here.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a7e5c2f19b4d'
down_revision: Union[str, Sequence[str], None] = 'c1d9f4a7b3e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('discord_id', sa.BigInteger(), nullable=True),
    )
    op.create_index('ix_users_discord_id', 'users', ['discord_id'], unique=True)


def downgrade() -> None:
    # Drops only what this revision added; nothing else here is touched,
    # and no ``_old`` object exists to restore.
    op.drop_index('ix_users_discord_id', table_name='users')
    op.drop_column('users', 'discord_id')
