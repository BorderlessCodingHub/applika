"""retire users.is_org_member as is_org_member_old (S10, KODI-029, Release C)

Revision ID: 583226ca46bc
Revises: ba44f9cfd3c1
Create Date: 2026-09-25 09:00:00.000000

Plan ``docs/plan/0009-discord-account-link.md`` ``## Data`` S10:
"``applika/backend/migrations/versions/<rev>_retire_users_is_org_member.py``
(new), ``down_revision`` = head at slice time: upgrade ``op.alter_column(
'users', 'is_org_member', new_column_name='is_org_member_old')`` (values,
NOT NULL, default kept); downgrade renames back. No drop anywhere."

ADR-0013 (Accepted 2026-09-24, "GitHub organisation membership is retired
from the whole product"): "The ORM stops mapping ``users.is_org_member`` in
the code release. A later, migration-only release renames the column to
``is_org_member_old``, and its downgrade renames it back." That code release
is Release B (KODI-026, tag ``0009-release-b``) — ``app/`` has not mapped,
read or written this column since that tag (see ``backend/CLAUDE.md``'s
**User** entity bullet; ``grep -rn is_org_member app/`` finds nothing).
This revision is Release C, the
migration-only rename ``prod-release-runbook.md`` rule 4 calls for: the code
that stops touching a column ships first, on an image already running; the
rename that retires the column ships in a later release, once the owner
confirms the prior migration (``ba44f9cfd3c1``, K5/S5) is applied in
production. Nothing under ``app/`` needs to change for this revision — it is
migration-only, exactly like S5 was code-free the other way around.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` works, is not empty and not ``pass`` — it renames the
column back. Rule 2: ``upgrade()`` drops no column and no table. Rule 3: the
retired column is renamed with the ``_old`` suffix,
``is_org_member`` -> ``is_org_member_old``. Rule 4: the data moves with the
rename itself — ``ALTER TABLE ... RENAME COLUMN`` keeps every row's value,
there is nothing to copy separately. Rule 5: ``downgrade()`` renames
``is_org_member_old`` back to ``is_org_member`` restoring the data (the same
rename, reversed — nothing was ever copied out of place). Rule 6: not
applicable, no column changes type, length or precision. Rule 7: ``app/``
neither reads nor writes ``is_org_member`` or ``is_org_member_old``, and no
ORM model maps either name (unchanged since Release B, KODI-026). Rule 9:
``is_org_member_old`` may be dropped later, only in a dedicated change the
owner explicitly orders — not here.

## Why a plain rename, not add+copy+drop-later

``op.alter_column(new_column_name=...)`` is the same rename Alembic already
uses for a same-type column move in this codebase's own migrations (e.g. the
five ``applications`` columns in ``ad747aba90fc``): it is one DDL statement,
keeps the column's type (``sa.Boolean()``), its ``NOT NULL`` and its
``server_default('false')`` exactly as ``d5e6f7a8b9c0`` set them, and every
existing row's value untouched — there is no window where two columns coexist
holding the same data to reconcile, unlike a rename that also changes shape
(compare ``ad747aba90fc``'s enum remap, which needs one because the values
themselves move, not just the name).

## What upgrade() does

Renames ``users.is_org_member`` to ``users.is_org_member_old``. Type
(``boolean``), ``NOT NULL`` and the ``server_default`` (``false``) all carry
over unchanged with the rename — a rename never touches a column's type,
nullability or default. Every value already stored survives, true or false,
unchanged.

## What downgrade() does

Renames ``users.is_org_member_old`` back to ``users.is_org_member``, the
exact reverse of ``upgrade()``. Type, ``NOT NULL`` and the default are
restored automatically since they were never altered — every value stored
since the upgrade (including one written after this revision's upgrade, had
anything still written it, which nothing does) survives the trip back.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '583226ca46bc'
down_revision: Union[str, Sequence[str], None] = 'ba44f9cfd3c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'users',
        'is_org_member',
        new_column_name='is_org_member_old',
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default='false',
    )


def downgrade() -> None:
    op.alter_column(
        'users',
        'is_org_member_old',
        new_column_name='is_org_member',
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default='false',
    )
