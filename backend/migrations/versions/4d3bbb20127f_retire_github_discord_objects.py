"""retire GitHub and Discord objects to _old, top up the A-to-B gap (Release C)

Revision ID: 4d3bbb20127f
Revises: b86d7ee66d94
Create Date: 2026-10-29 18:00:00.000000

Plan ``docs/plan/0018-borderless-sign-in-and-membership-badges.md``
``## Data`` C1, ADR-0024 (Borderless as sole login and membership badges)
section 8: "Release C, migration only. First tops up github_connections and
report_webhooks (with no badge) with the rows created between Release A and
Release B. Then renames the retired objects to _old and keeps their data
... The downgrade renames them back. C must be downgraded before the image
is rolled back past B."

Release B's code maps none of the four objects this revision retires:
``UserModel`` maps neither ``users.github_id`` nor
``users.encrypted_github_token``, and no model maps ``discord_connections``
or ``discord_report_webhooks``. This revision is migration-only, as
``prod-release-runbook.md`` rule 4 asks: it ships after the owner confirms
Release A (``d9e0b46dd7e1``) and its follow-up (``b86d7ee66d94``) ran in
production and Release B's image is live.

## Why a top-up

Release A copied every GitHub identity and every Discord report webhook
into the new tables. Between Release A's migration and Release B's image,
the old code kept running: a GitHub sign-up wrote ``users.github_id`` only,
and an administrator could add a ``discord_report_webhooks`` row. Those
rows have no copy yet, so they are copied here, before the source is set
aside:

* a ``github_connections`` row (snowflake id, ADR-0003) for every user with
  a ``github_id`` and none yet, matched on ``user_id`` or ``github_id``
  (``linked_at = users.created_at``), so a later GitHub restore finds it;
* a ``report_webhooks`` row (label kept) for every
  ``discord_report_webhooks`` URL missing from ``report_webhooks``.
  ``report_webhooks.badge`` is ``badge_old`` since ``b86d7ee66d94`` and is
  not written; no ``report_webhook_badges`` row is written either, so the
  webhook receives nothing until an administrator assigns a badge.

Both inserts are ``ON CONFLICT DO NOTHING``. Release B's GitHub restore
never deletes a ``github_connections`` row, so a copy made now is
consistent with whatever B wrote.

## What upgrade() does

Tops up the two tables, then renames, keeping every row and value:
``discord_connections`` -> ``discord_connections_old``,
``discord_report_webhooks`` -> ``discord_report_webhooks_old``,
``users.github_id`` -> ``github_id_old``,
``users.encrypted_github_token`` -> ``encrypted_github_token_old``.
Indexes and constraints travel with the renamed objects under their
original names.

## What downgrade() does

Renames the four objects back to their original names, with their data.
The topped-up rows stay: they are consistent copies of the restored
sources, and Release A's tables already hold the same kind of copy.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` works and is not empty. Rule 2: ``upgrade()`` drops
no column and no table. Rule 3: every retired object takes the ``_old``
suffix. Rule 4: the data moves in this revision (the top-up), and the
rename keeps every source row. Rule 5: ``downgrade()`` renames the ``_old``
objects back, their data intact. Rule 9: the ``_old`` objects are removed
only in a dedicated change the owner explicitly orders, never here.
ADR-0005 (expand first, code second) and ``prod-release-runbook.md`` rule 4:
B's code stopped using these objects before this rename ships.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = '4d3bbb20127f'
down_revision: Union[str, Sequence[str], None] = 'b86d7ee66d94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RETIRED_TABLES = ('discord_connections', 'discord_report_webhooks')
GITHUB_ID = 'github_id'
GITHUB_TOKEN = 'encrypted_github_token'


def _top_up_github_connections(bind: sa.engine.Connection) -> None:
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


def _top_up_report_webhooks(bind: sa.engine.Connection) -> None:
    """One row per Discord report webhook not carried over yet, with no
    badge: no ``badge_old`` value and no ``report_webhook_badges`` row."""
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
            'INSERT INTO report_webhooks (id, created_at, url, label) '
            'VALUES (:id, :created_at, :url, :label) '
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


def upgrade() -> None:
    bind = op.get_bind()
    # Copy first, while the sources still carry their original names.
    _top_up_github_connections(bind)
    _top_up_report_webhooks(bind)

    # Rename, never drop: every row and value stays.
    for table in RETIRED_TABLES:
        op.rename_table(table, f'{table}_old')
    op.alter_column(
        'users',
        GITHUB_ID,
        new_column_name=f'{GITHUB_ID}_old',
        existing_type=sa.BigInteger(),
        existing_nullable=True,
    )
    op.alter_column(
        'users',
        GITHUB_TOKEN,
        new_column_name=f'{GITHUB_TOKEN}_old',
        existing_type=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    # The topped-up rows stay: consistent copies of the restored sources.
    op.alter_column(
        'users',
        f'{GITHUB_TOKEN}_old',
        new_column_name=GITHUB_TOKEN,
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.alter_column(
        'users',
        f'{GITHUB_ID}_old',
        new_column_name=GITHUB_ID,
        existing_type=sa.BigInteger(),
        existing_nullable=True,
    )
    for table in reversed(RETIRED_TABLES):
        op.rename_table(f'{table}_old', table)
