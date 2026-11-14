"""applika-cli depends on Typer only. Newer Typer vendors its own Click and
no longer installs ``click``, so applika's code never imports it."""

import ast
import enum
import os
import subprocess
import sys
from pathlib import Path

import pytest
import typer
from conftest import FakeStore
from typer.testing import CliRunner

import applika.app as cli_app
from applika.config import ApiBaseUrlSource
from applika.lib import updater

SRC = Path(cli_app.__file__).resolve().parent
OTHER_URL = 'http://127.0.0.1:8000/api'
URL_ENV_LINE = (
    'Cannot update: the API base URL is http://127.0.0.1:8000/api (from '
    'APPLIKA_API_BASE_URL), not https://applika.dev/api. --force does not '
    'change this. Unset APPLIKA_API_BASE_URL.'
)

# Refuses `click` to any import statement in applika's own modules, even
# when Typer has already loaded it; Typer (and whatever Click it brings)
# imports as usual.
BLOCK_CLICK = """
import builtins
import sys

real_import = builtins.__import__


def block_click_for_applika(name, globals=None, *args, **kwargs):
    importer = (globals or {}).get('__name__') or ''
    from_applika = importer == 'applika' or importer.startswith('applika.')
    if from_applika and name.split('.')[0] == 'click':
        raise ModuleNotFoundError(f"No module named '{name}'", name=name)
    return real_import(name, globals, *args, **kwargs)


builtins.__import__ = block_click_for_applika

from applika.app import app

sys.argv = ['applika', *sys.argv[1:]]
app(prog_name='applika')
"""


def _imports(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            yield node.module or ''


def test_no_module_imports_click_or_typers_private_copy():
    found = []
    for path in sorted(SRC.rglob('*.py')):
        tree = ast.parse(path.read_text(encoding='utf-8'))
        for name in _imports(tree):
            root = name.split('.')[0]
            if root == 'click' or name.startswith('typer._'):
                found.append(f'{path.relative_to(SRC)}: {name}')

    assert found == []


def _run_without_click(tmp_path, *args, env=None):
    run_env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith('APPLIKA_')
    }
    # The session and the update record live under HOME: a scratch one.
    run_env.update(HOME=str(tmp_path), USERPROFILE=str(tmp_path))
    run_env.update(env or {})
    return subprocess.run(
        [sys.executable, '-c', BLOCK_CLICK, *args],
        capture_output=True,
        text=True,
        env=run_env,
        cwd=tmp_path,
        timeout=60,
    )


def test_the_guard_does_block_a_click_import_from_applika(tmp_path):
    probe = BLOCK_CLICK.replace(
        'from applika.app import app',
        "import applika\nexec('import click', vars(applika))",
    )
    result = subprocess.run(
        [sys.executable, '-c', probe],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        timeout=60,
    )

    assert result.returncode == 1
    assert "No module named 'click'" in result.stderr


@pytest.mark.parametrize('force', [[], ['--force']], ids=['plain', 'force'])
def test_env_url_refusal_runs_without_click(tmp_path, force):
    result = _run_without_click(
        tmp_path, 'update', *force, env={'APPLIKA_API_BASE_URL': OTHER_URL}
    )

    assert result.returncode == 1, result.stderr
    lines = result.stderr.splitlines()
    # Run from this checkout, the source-checkout refusal follows it.
    assert lines[0] == URL_ENV_LINE
    assert not any('--api-base-url' in line for line in lines)
    assert result.stdout == ''
    assert list(tmp_path.iterdir()) == []


def test_help_runs_without_click(tmp_path):
    result = _run_without_click(tmp_path, '--help')

    assert result.returncode == 0, result.stderr
    assert 'update' in result.stdout


# A Typer that vendors Click hands back its own ParameterSource: a foreign
# enum, equal by name only.
class Foreign(enum.Enum):
    COMMANDLINE = enum.auto()
    ENVIRONMENT = enum.auto()
    DEFAULT = enum.auto()


def _source_seen(monkeypatch, foreign_source, args, env=None):
    seen = []
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: FakeStore(None))
    # The Context class that defines it: Click's, or Typer's vendored copy.
    owner = next(
        cls
        for cls in typer.Context.__mro__
        if 'get_parameter_source' in vars(cls)
    )
    monkeypatch.setattr(
        owner, 'get_parameter_source', lambda self, name: foreign_source
    )
    real = updater.blockers

    def spy(config, *a, **k):
        seen.append(config)
        return real(config, *a, **k)

    # The URL is not the default one either way: refused before any network.
    monkeypatch.setattr(updater, 'blockers', spy)
    result = CliRunner().invoke(cli_app.app, args, env=env)
    assert result.exit_code == 1
    return [config.api_base_url_source for config in seen]


@pytest.mark.parametrize(
    ('foreign_source', 'args', 'expected'),
    [
        (Foreign.ENVIRONMENT, ['update'], ApiBaseUrlSource.ENV),
        (
            Foreign.COMMANDLINE,
            ['--api-base-url', OTHER_URL, 'update'],
            ApiBaseUrlSource.FLAG,
        ),
    ],
    ids=['environment', 'commandline'],
)
def test_a_foreign_parameter_source_is_read_by_name(
    monkeypatch, foreign_source, args, expected
):
    env = {'APPLIKA_API_BASE_URL': OTHER_URL}

    assert _source_seen(monkeypatch, foreign_source, args, env) == [expected]
