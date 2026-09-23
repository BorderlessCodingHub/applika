"""tailored_cvs.base_snapshot: a nullable JSONB snapshot of the master CV a
copy was made from (R5, KODI-017 part 2)

Revision ID: c1d9f4a7b3e6
Revises: ad747aba90fc
Create Date: 2026-09-19 10:00:00.000000

Plan: the KODI-017 ticket's PART 2 block, T086. The owner: "I want something
in the form to tell me what was from the original cv and what changed (a
diff)" and, on the baseline design, "Snapshot taken at copy time
(Recommended)". This revision adds the column the baseline is read from;
KODI-017 part 2's backend slice (T087) fills it on copy creation.

## What this revision does

Purely additive: one nullable JSONB column, ``tailored_cvs.base_snapshot``,
no ``server_default`` and **no backfill**. Existing copies keep
``base_snapshot IS NULL`` after this migration runs — the frontend's baseline
resolution falls back to the current master CV (via ``base_cv_id``) for those
rows, exactly as the diff design's "Baseline resolution" section spells out.
Nothing else in the schema changes: ``base_cv_id`` keeps its existing
``ON DELETE SET NULL`` foreign key, untouched by this revision.

``downgrade()`` drops only the column this revision added — there is no
``_old`` object to rename back, because nothing here retires or renames an
existing column (rule 3 of ``non-destructive-migrations.md`` only applies to
a *retired* object; this migration retires nothing).

## Owner-accepted exception to prod-release-runbook.md rule 4

Rule 4 ("expand first, code second") ordinarily requires an additive
migration to ship in a release whose code does not yet read or write the new
column, so the API keeps working against the old schema in the gap between
the CD image deploy and the owner's manual ``alembic upgrade head``. The
owner explicitly waived that separation for this column ("New revision at
head (after R2)" — see the PRD 0007 Clarifications entry dated
2026-09-19, KODI-017): ``base_snapshot`` ships in the **same** release as the
backend code that reads and writes it (T087) and the frontend diff UI that
reads it (T088), because splitting the column into an earlier, code-free
release would gain nothing here — the column is optional input to a new
feature (the diff), not a rename of something old code still relies on.

**Consequence, accepted by the owner:** between the CD image deploy (which
publishes the new API image, `applika/.github/workflows/backend-cd.yaml`)
and the owner running `alembic upgrade head` inside the API container
(`prod-release-runbook.md`), the new API image is briefly running against the
*old* schema — `tailored_cvs` with no `base_snapshot` column yet. Every route
under `/applications/{id}/cv` that loads or writes a `TailoredCVModel` row
fails during that window, because the ORM
(`TailoredCVModel.base_snapshot`, mapped by this same release) selects or
inserts a column the database does not yet have. That is **every** verb on
`/applications/{id}/cv` — `POST`, `GET`, `PUT` and `DELETE` — plus
`POST /applications/{id}/cv/pdf`, which loads the same row to render it.
This is a deliberate, owner-accepted trade — not an oversight — recorded
here and in ``backend/CHANGELOG.md`` so the runbook's manual migration step
is not skipped or delayed for this release. Nothing else is affected:
`/base-cvs*` never touches `tailored_cvs`, and `ApplicationModel.tailored_cv`
is lazy-loaded, so an application's other routes do not either.

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
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'c1d9f4a7b3e6'
down_revision: Union[str, Sequence[str], None] = 'ad747aba90fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tailored_cvs',
        sa.Column('base_snapshot', JSONB, nullable=True),
    )


def downgrade() -> None:
    # Drops only the column this revision added; nothing else here is
    # touched, and no ``_old`` object exists to restore.
    op.drop_column('tailored_cvs', 'base_snapshot')
