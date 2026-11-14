"""Beta-gated command groups stay out of their parent's --help.

`applika cvs` and `applika applications cv` sit behind the API's `cvs` beta
feature: a user off the beta list gets 404 from every route they call. They
are hidden from `applika --help` and `applika applications --help`, but stay
callable and list every command under their own --help.
"""

import re

import pytest

from applika.app import app

CVS_COMMANDS = ['list', 'get', 'create', 'edit', 'delete', 'download']
CV_COPY_COMMANDS = ['get', 'create', 'edit', 'delete', 'download', 'diff']


def _listed_commands(output: str) -> list[str]:
    """The command names in the help's Commands panel."""
    _, _, panel = output.partition('Commands')
    return re.findall(r'^│ (\S+)\s', panel, flags=re.MULTILINE)


@pytest.fixture
def wide(monkeypatch):
    # One line per command row, so the parse never sees a wrapped name.
    monkeypatch.setenv('COLUMNS', '200')


def test_root_help_omits_cvs(runner, wide):
    result = runner.invoke(app, ['--help'])

    assert result.exit_code == 0
    commands = _listed_commands(result.output)
    assert 'applications' in commands
    assert 'cvs' not in commands


def test_cvs_help_lists_every_command(runner, wide):
    result = runner.invoke(app, ['cvs', '--help'])

    assert result.exit_code == 0
    assert _listed_commands(result.output) == CVS_COMMANDS


def test_applications_help_omits_cv(runner, wide):
    result = runner.invoke(app, ['applications', '--help'])

    assert result.exit_code == 0
    commands = _listed_commands(result.output)
    assert 'timeline' in commands
    assert 'cv' not in commands


def test_applications_cv_help_lists_every_command(runner, wide):
    result = runner.invoke(app, ['applications', 'cv', '--help'])

    assert result.exit_code == 0
    assert _listed_commands(result.output) == CV_COPY_COMMANDS
