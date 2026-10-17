"""discord_connections + discord_report_webhooks (K5, KODI-023, Release A2)

Revision ID: ba44f9cfd3c1
Revises: c1d9f4a7b3e6
Create Date: 2026-09-24 10:00:00.000000

Plan ``docs/plan/0009-discord-account-link.md`` ``## Data``,
``## Scope Releases`` section K5. ADR-0013 (Accepted 2026-09-24, supersedes
ADR-0008). Owner, 2026-09-24: "i would like to abandom the last ticket and
expand this plan, when the user clicks to connect thir applika account with
discord, i want to save the refresh token and all data related to this
connection in a new table istead directly in users, save only the refresh
token criptografed (new end to set the encryption secret)." "Remove the
environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an
admin user i can configure which webhooks to send my reports (new table to
save the discord webhook url, the server id - will be used to check if the
user is in this server - and multiples roles id in this discord server -
this is optional)."

This revision **replaces** the unshipped ``a7e5c2f19b4d`` (``users.discord_id``,
ADR-0008), which never reached ``develop`` or ``main`` and does not exist on
this branch. ADR-0013 retired that design in favour of a connection record of
its own, so there is nothing to rename or migrate away from: this is a fresh
additive revision, not a follow-up to a shipped one.

## Release A2: expand only (prod-release-runbook.md rule 4)

Nothing under ``app/`` reads or writes a single object this revision creates;
no ORM model maps ``discord_connections`` or ``discord_report_webhooks``. The
code that uses them ships in K6/K8, in a later release, only after the owner
confirms ``alembic upgrade head`` ran in production. Unlike
``c1d9f4a7b3e6`` (which the owner explicitly exempted from rule 4 because its
column was optional input to an existing route already shipping that
release), this revision has **no** such exception: it stands alone,
code-free, exactly as rule 4 expects.

## What upgrade() does

1. Enum ``discord_connection_status`` (``active``, ``needs_reconnect``),
   lower-case labels, as ``event_type``/``interview_type`` set the
   convention (``afd4074c70c2``).
2. Table ``discord_connections``: one row per user (``user_id`` unique, FK
   ``users.id`` ON DELETE CASCADE — AC1/AC2), a unique Discord id (AC1), the
   identity/consent fields ADR-0013 names (AC3), ``encrypted_refresh_token``
   and no access-token column (AC4), and no server/role column — those are
   read live at submit time by K6/K8, never stored (AC5, ADR-0013 "The
   server list and the roles are read live at submit time and never
   stored.").
3. Table ``discord_report_webhooks``: an admin-managed catalog (ADR-0004),
   no ``user_id``, a unique webhook URL, a guild id with its own index (the
   lookup ADR-0013's submit flow runs: "selects the webhooks of those
   servers"), and optional ``role_ids`` defaulting to an empty array.

``users`` is not touched by this revision — no column added, renamed or
dropped. ``users.is_org_member`` stays mapped exactly as it is today; ADR-0013
retires it in a later, separate release.

## What downgrade() does

Drops only this revision's own three objects, in reverse dependency order:
``discord_report_webhooks``, then ``discord_connections``, then the enum.
Nothing else in the schema is touched, because nothing else was created.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` works, it is not empty and not ``pass``. Rule 2:
``upgrade()`` drops nothing. Rule 3: not applicable — no object is retired.
Rule 4: not applicable — no data moves, there is nothing to copy. Rule 6: not
applicable — no column shrinks. Rule 7: ``app/`` never reads or writes an
``_old`` object — this revision creates none, and it maps no ORM model at
all (rule 4 of the runbook, above). Rule 8: not applicable — the enum is
brand new, nothing swaps.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'ba44f9cfd3c1'
down_revision: Union[str, Sequence[str], None] = 'c1d9f4a7b3e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DISCORD_CONNECTION_STATUSES = ('active', 'needs_reconnect')


def upgrade() -> None:
    status_labels = ', '.join(
        f"'{status}'" for status in DISCORD_CONNECTION_STATUSES
    )
    op.execute(
        f'CREATE TYPE discord_connection_status AS ENUM ({status_labels})'
    )
    discord_connection_status = postgresql.ENUM(
        name='discord_connection_status', create_type=False
    )

    op.create_table(
        'discord_connections',
        sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('discord_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(32), nullable=False),
        sa.Column('global_name', sa.String(32), nullable=True),
        sa.Column('avatar', sa.String(64), nullable=True),
        sa.Column('scopes', sa.String(255), nullable=False),
        sa.Column('encrypted_refresh_token', sa.Text(), nullable=False),
        sa.Column(
            'access_token_expires_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            'status',
            discord_connection_status,
            nullable=False,
            server_default='active',
        ),
        sa.Column(
            'linked_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint('id', name='pk_discord_connections'),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_discord_connections_user_id',
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint('user_id', name='uq_discord_connections_user_id'),
        sa.UniqueConstraint(
            'discord_id', name='uq_discord_connections_discord_id'
        ),
    )

    op.create_table(
        'discord_report_webhooks',
        sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('guild_id', sa.BigInteger(), nullable=False),
        sa.Column('webhook_url', sa.String(500), nullable=False),
        sa.Column(
            'role_ids',
            postgresql.ARRAY(sa.BigInteger()),
            nullable=False,
            server_default='{}',
        ),
        sa.Column('label', sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_discord_report_webhooks'),
        sa.UniqueConstraint(
            'webhook_url', name='uq_discord_report_webhooks_webhook_url'
        ),
    )
    op.create_index(
        'ix_discord_report_webhooks_guild_id',
        'discord_report_webhooks',
        ['guild_id'],
    )


def downgrade() -> None:
    # Drops only this revision's own objects, reverse dependency order.
    op.drop_index(
        'ix_discord_report_webhooks_guild_id',
        table_name='discord_report_webhooks',
    )
    op.drop_table('discord_report_webhooks')
    op.drop_table('discord_connections')
    op.execute('DROP TYPE IF EXISTS discord_connection_status')
