"""cv periods: experience/education free text -> required start + optional end

Revision ID: d3f7b1c9e2a4
Revises: f2a9c1d4b6e8
Create Date: 2026-09-17 09:00:00.000000

The owner: "Today for Education and Experience, the period input is optional,
this must be required, and needs to change, instead of a bare text input it
needs to ask when started and when finished (finish is optional, when empty is
counted as Present), it's a date input but only for month and year "MM/yyyy"
for both start and finish." And, on this very migration: "to this change it
needs to be in a new migration".

So this is a **new** revision, a child of ``f2a9c1d4b6e8``, not an amendment of
it. ``f2a9c1d4b6e8`` was amended in place once, on the owner's explicit order
and while it had never run anywhere; that was a one-off and not a precedent.

## What it does

On ``base_cvs`` **and** ``tailored_cvs`` - the copy is a full snapshot and
carries every section its master has - for both the ``experience`` and the
``education`` JSONB columns:

1. rename the column to ``<section>_old``;
2. add a new ``<section>`` JSONB column, NOT NULL, ``server_default '[]'``,
   declared exactly as ``f2a9c1d4b6e8`` declares every section column;
3. copy every item across with ``period`` removed and ``start``/``end`` added.

## No parser, by order

Every migrated item is seeded with ``start = '2026-01'`` and
``end = '2026-01'`` - the owner's words, "for default during migration, seed as
"01/2026" to both start and finish" - **including** items whose old text was
perfectly parseable. ISO ``YYYY-MM`` is the stored form of his ``01/2026``
(see ``app/application/dto/base_cv.py``), so ``01/2026`` is stored ``2026-01``.

Nothing is parsed and nothing is guessed. The original free text survives
verbatim in ``<section>_old``, which is the whole point of taking the ``_old``
route rather than remapping in place: a user who wants their real dates back
reads them off the retired column. Every other field of every item -
``id``, ``company``, ``role``, ``bullets``, ``location``,
``company_description``, ``institution``, ``degree``, ``area`` - crosses
unchanged; only ``period`` is dropped from the item.

## non-destructive-migrations.md

``upgrade()`` drops no column and no table (rule 2): the retired columns are
renamed with the ``_old`` suffix (rule 3) and the data moves in this same
revision (rule 4). ``downgrade()`` drops the columns this revision added and
renames the ``_old`` columns back, restoring the original data with it
(rules 1 and 5). No column shrinks (rule 6). No application code and no ORM
model touches an ``_old`` column (rule 7). The ``_old`` columns are **not**
deleted here; that is a later change the owner has to order (rule 9).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'd3f7b1c9e2a4'
down_revision: Union[str, Sequence[str], None] = 'f2a9c1d4b6e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The two CV sections that carry a period, on both CV tables.
_DATED_SECTIONS = ('experience', 'education')
_CV_TABLES = ('base_cvs', 'tailored_cvs')

# The owner's migration default: "for default during migration, seed as
# "01/2026" to both start and finish". Stored ISO, so 01/2026 is 2026-01.
SEED_START = '2026-01'
SEED_END = '2026-01'

# The JSON object merged onto every migrated item. ``||`` on two jsonb objects
# is a shallow merge, so this both adds the two keys and would overwrite them
# had the item somehow carried them already.
_SEED_OBJECT = (
    f"""jsonb_build_object('start', '{SEED_START}', 'end', '{SEED_END}')"""
)


def _remap_sql(table: str, section: str) -> str:
    """Rebuild ``<section>`` from ``<section>_old``: drop ``period``, add dates.

    Three things this statement is careful about.

    ``COALESCE(..., '[]'::jsonb)``: ``jsonb_agg`` over **zero** rows returns
    NULL, not ``'[]'``, so a CV with an empty section would drive a NULL into a
    NOT NULL column and abort the whole migration halfway through.

    ``WITH ORDINALITY`` + ``ORDER BY``: ``jsonb_array_elements`` makes no
    promise about row order and neither does ``jsonb_agg`` without one. A CV's
    experience list is chronological to its owner; reordering it silently would
    be its own kind of data loss.

    The two ``jsonb_typeof`` guards: the column is written only by the ORM from
    validated models, so it always holds an array of objects - but a migration
    that runs by hand on a production database gets to be total rather than
    merely probable.
    """
    return f"""
        UPDATE {table} AS cv
        SET {section} = COALESCE(
            (
                SELECT jsonb_agg(
                    CASE
                        WHEN jsonb_typeof(element.item) = 'object'
                        THEN (element.item - 'period') || {_SEED_OBJECT}
                        ELSE element.item
                    END
                    ORDER BY element.position
                )
                FROM jsonb_array_elements(cv.{section}_old)
                     WITH ORDINALITY AS element(item, position)
            ),
            '[]'::jsonb
        )
        WHERE jsonb_typeof(cv.{section}_old) = 'array'
    """


def _section_column(name: str) -> sa.Column:
    """A CV section column, declared exactly as ``f2a9c1d4b6e8`` declares one."""
    return sa.Column(
        name,
        postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    )


def upgrade() -> None:
    for table in _CV_TABLES:
        for section in _DATED_SECTIONS:
            # -- 1. Retire the free-text column. Renamed, never dropped.
            op.alter_column(table, section, new_column_name=f'{section}_old')
            # -- 2. The new column, with the same declaration the sections
            #       already have: JSONB, NOT NULL, default '[]'.
            op.add_column(table, _section_column(section))
            # -- 3. Move the data, in the same revision that renamed it.
            op.execute(sa.text(_remap_sql(table, section)))


def downgrade() -> None:
    for table in _CV_TABLES:
        for section in _DATED_SECTIONS:
            # -- Reverse 3 + 2. The seeded copy goes; the original data is
            #    still sitting untouched in the ``_old`` column.
            op.drop_column(table, section)
            # -- Reverse 1. The original column comes back under its own name,
            #    with its data, its NOT NULL and its '[]' default.
            op.alter_column(table, f'{section}_old', new_column_name=section)
