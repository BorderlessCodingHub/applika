"""The Alembic chain has exactly one head.

The one head check of the suite. It names no revision, so a new revision
edits no test: each revision's own test asserts its parent link instead.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / 'alembic.ini'


def test_the_migration_chain_has_a_single_head() -> None:
    script = ScriptDirectory.from_config(Config(str(_ALEMBIC_INI)))

    heads = script.get_heads()

    assert len(heads) == 1, f'expected one Alembic head, found {heads}'
