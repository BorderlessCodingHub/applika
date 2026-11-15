"""feedback catalog contract: feedbacks_definition to feedbacks_definition_old

Revision ID: 11a92f3a9dc1
Revises: 0ee9f822e6d1
Create Date: 2026-11-14 16:00:00.000000

Plan ``docs/plan/0023-retire-cli-for-mcp.md`` ``## Data`` (release C),
ADR-0028 (Retire the CLI for a hosted MCP server) and ADR-0012 Delta 3:
"the step and feedback catalogs keep their table names, become read-only,
and are read only by the compatibility layer. They are renamed ``_old`` in
the change that removes that layer."

Release C removes that layer: ``/supports`` no longer serves ``feedbacks``,
the 0.1.4 finalize body is refused, and ``FeedbackDefinitionModel`` and its
repository are gone. Nothing in ``app/`` reads ``feedbacks_definition``
under either name, so this revision retires it.
``steps_definition`` keeps its name: ``compat/step_translation.py`` still
reads it for every application's ``last_step`` and for the agenda.

## What upgrade() does

``feedbacks_definition`` -> ``feedbacks_definition_old``, a rename: no row
copied, none lost. Its primary key, its ``id`` column and every foreign key
that points at it (``applications.feedback_id_old``, constraint
``fk_applications_feedback_id_old``, since ``ad747aba90fc``) follow the
rename, because Postgres binds a foreign key to the table, not to its name.
Constraints keep their original names, as ``4d3bbb20127f`` did. No trigger,
view or function at the parent names the table (``ad747aba90fc`` dropped the
transitional triggers that did), so nothing else needs to move.

Re-adopt guard: when both names exist (an own downgrade, then something
re-created ``feedbacks_definition``, such as ``Base.metadata.create_all``
run by an older image against this database), ``feedbacks_definition`` is
kept as it is and the existing ``feedbacks_definition_old`` copy is left
untouched, rows included; nothing is renamed over, merged or dropped. When
only ``feedbacks_definition_old`` exists, the catalog is already retired
and nothing changes.

## What downgrade() does

``feedbacks_definition_old`` -> ``feedbacks_definition``, its rows, its
primary key and the foreign key from ``applications.feedback_id_old``
intact. When both names exist the guard keeps ``feedbacks_definition`` and
leaves the ``_old`` copy untouched, as on the way up. No ``drop_*``.

## Release and rollback

Release C. The C image reads the catalog under neither name, so it runs
before and after this revision (the deploy runs ``alembic upgrade head``,
plan corrections 1). Rollback order: ``alembic downgrade 0ee9f822e6d1``
inside the C container FIRST, then the B images: the B image's
``FeedbackDefinitionModel`` maps ``feedbacks_definition`` by its original
name.

## non-destructive-migrations.md

Rule 1: ``downgrade()`` is real (the rename back). Rule 2: ``upgrade()``
drops no column and no table. Rule 3: the retired table takes the ``_old``
suffix. Rule 5: ``downgrade()`` renames it back with every row. Rule 7: no
ORM model maps ``feedbacks_definition`` or ``feedbacks_definition_old``.
Rule 9: ``feedbacks_definition_old`` is deleted only in a later change the
owner explicitly orders, never here. ADR-0005 (non-destructive
migrations).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '11a92f3a9dc1'
down_revision: Union[str, Sequence[str], None] = '0ee9f822e6d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATALOG = 'feedbacks_definition'
CATALOG_OLD = f'{CATALOG}_old'


def _tables(bind: sa.engine.Connection) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def upgrade() -> None:
    tables = _tables(op.get_bind())
    # Re-adopt guard: with both names present keep feedbacks_definition and
    # leave the _old copy as it is; with only the _old name, already done.
    if CATALOG in tables and CATALOG_OLD not in tables:
        op.rename_table(CATALOG, CATALOG_OLD)


def downgrade() -> None:
    tables = _tables(op.get_bind())
    # Same guard: the parent needs feedbacks_definition; an existing one is
    # kept and the _old copy is left untouched.
    if CATALOG_OLD in tables and CATALOG not in tables:
        op.rename_table(CATALOG_OLD, CATALOG)
