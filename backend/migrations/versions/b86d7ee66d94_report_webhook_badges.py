"""a report webhook holds one or more badges (Release A)

Revision ID: b86d7ee66d94
Revises: d9e0b46dd7e1
Create Date: 2026-10-29 16:00:00.000000

Plan ``docs/plan/0018-borderless-sign-in-and-membership-badges.md``
``## Data`` (A2), ADR-0024 sections 6 and 8: a report webhook is assigned to
a set of badges (BASE, PSP or both) instead of a single nullable ``badge``.

New table ``report_webhook_badges`` (platform catalog, no ``user_id``,
admin only): ``report_webhook_id`` FK ``report_webhooks.id`` ON DELETE
CASCADE, ``badge`` ``borderless_base`` or ``borderless_psp``
(``ck_report_webhook_badges_badge``), PK ``(report_webhook_id, badge)``.

upgrade:

* a ``report_webhook_badges_old`` left by this revision's own downgrade is
  renamed back with its rows; otherwise the table is created;
* every non-null ``report_webhooks.badge`` becomes one link row
  (``ON CONFLICT DO NOTHING``, so a re-upgrade adds no duplicate);
* ``report_webhooks.badge`` is renamed ``badge_old``
  (``ck_report_webhooks_badge`` travels with it).

downgrade:

* ``badge_old`` is renamed back to ``badge`` and set from the link rows:
  NULL for a webhook with none, ``MIN(badge)`` (``borderless_base``) for one
  holding both;
* ``report_webhook_badges`` is renamed ``report_webhook_badges_old`` with the
  full set of rows.

This is Release A: migration only (``prod-release-runbook.md`` rule 4,
"expand first"). Nothing in ``app/`` maps ``report_webhook_badges`` until
Release B, and nothing ever maps ``report_webhooks.badge_old`` or
``report_webhook_badges_old`` (``non-destructive-migrations.md`` rule 7).
Never ``drop_column`` or ``drop_table`` (rules 2 and 3).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b86d7ee66d94'
down_revision: Union[str, Sequence[str], None] = 'd9e0b46dd7e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = 'report_webhook_badges'
TABLE_OLD = f'{TABLE}_old'
WEBHOOKS = 'report_webhooks'
BADGE = 'badge'
BADGE_OLD = f'{BADGE}_old'
BADGES = "('borderless_base', 'borderless_psp')"


def _create_link_table() -> None:
    op.create_table(
        TABLE,
        sa.Column(
            'report_webhook_id',
            sa.BigInteger(),
            nullable=False,
            autoincrement=False,
        ),
        sa.Column(BADGE, sa.String(40), nullable=False),
        sa.PrimaryKeyConstraint('report_webhook_id', BADGE, name=f'pk_{TABLE}'),
        sa.ForeignKeyConstraint(
            ['report_webhook_id'],
            [f'{WEBHOOKS}.id'],
            name=f'fk_{TABLE}_report_webhook_id',
            ondelete='CASCADE',
        ),
        sa.CheckConstraint(f'badge IN {BADGES}', name=f'ck_{TABLE}_badge'),
    )


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE_OLD in set(sa.inspect(bind).get_table_names()):
        # Left by this revision's own downgrade: rows, PK, FK and CHECK
        # travel with the rename.
        op.rename_table(TABLE_OLD, TABLE)
    else:
        _create_link_table()

    bind.execute(
        sa.text(
            f'INSERT INTO {TABLE} (report_webhook_id, badge) '
            f'SELECT id, badge FROM {WEBHOOKS} WHERE badge IS NOT NULL '
            'ON CONFLICT DO NOTHING'
        )
    )

    # Rename, never drop: every value stays.
    op.alter_column(WEBHOOKS, BADGE, new_column_name=BADGE_OLD)


def downgrade() -> None:
    bind = op.get_bind()
    op.alter_column(WEBHOOKS, BADGE_OLD, new_column_name=BADGE)

    # One badge per webhook: none -> NULL, both -> the smallest
    # (``borderless_base``), deterministic.
    bind.execute(
        sa.text(
            f'UPDATE {WEBHOOKS} w SET badge = ('
            f'SELECT MIN(l.badge) FROM {TABLE} l '
            'WHERE l.report_webhook_id = w.id)'
        )
    )

    # Rename, never drop: the full set of rows stays.
    op.rename_table(TABLE, TABLE_OLD)
