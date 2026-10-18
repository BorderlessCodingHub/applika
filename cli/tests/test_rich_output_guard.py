from types import SimpleNamespace

import pytest
import typer
from conftest import (
    RICH_TEST_WIDTH,
    apply_plain_wide_rich_output,
    require_typer_console_knobs,
)
from typer import rich_utils as typer_rich_utils


def test_installed_typer_has_the_console_knobs():
    require_typer_console_knobs()


def test_autouse_fixture_patched_the_installed_typer():
    assert typer_rich_utils.FORCE_TERMINAL is False
    assert typer_rich_utils.MAX_WIDTH == RICH_TEST_WIDTH


@pytest.mark.parametrize('missing', ['FORCE_TERMINAL', 'MAX_WIDTH'])
def test_guard_names_the_missing_knob_and_the_typer_version(missing):
    knobs = {'FORCE_TERMINAL': None, 'MAX_WIDTH': None}
    del knobs[missing]
    stand_in = SimpleNamespace(**knobs)

    with pytest.raises(pytest.fail.Exception) as failure:
        require_typer_console_knobs(stand_in)

    message = str(failure.value)
    assert f'typer.rich_utils.{missing} not found' in message
    assert f'typer {typer.__version__}' in message
    assert 'cli/tests/conftest.py' in message
    present = ({'FORCE_TERMINAL', 'MAX_WIDTH'} - {missing}).pop()
    assert present not in message


def test_guard_names_every_missing_knob():
    with pytest.raises(pytest.fail.Exception) as failure:
        require_typer_console_knobs(SimpleNamespace())

    message = str(failure.value)
    assert 'typer.rich_utils.FORCE_TERMINAL' in message
    assert 'typer.rich_utils.MAX_WIDTH' in message


def test_renamed_knob_in_the_real_module_fails_before_patching(monkeypatch):
    monkeypatch.delattr(typer_rich_utils, 'MAX_WIDTH')

    with pytest.raises(pytest.fail.Exception, match='MAX_WIDTH not found'):
        apply_plain_wide_rich_output(monkeypatch)


def test_guard_runs_before_anything_is_patched(monkeypatch):
    stand_in = SimpleNamespace(FORCE_TERMINAL=True)

    with pytest.raises(pytest.fail.Exception):
        apply_plain_wide_rich_output(monkeypatch, stand_in)

    assert stand_in.FORCE_TERMINAL is True
    assert not hasattr(stand_in, 'MAX_WIDTH')


def test_patch_sets_plain_and_wide_on_a_complete_module(monkeypatch):
    stand_in = SimpleNamespace(FORCE_TERMINAL=True, MAX_WIDTH=40)

    apply_plain_wide_rich_output(monkeypatch, stand_in)

    assert stand_in.FORCE_TERMINAL is False
    assert stand_in.MAX_WIDTH == RICH_TEST_WIDTH
