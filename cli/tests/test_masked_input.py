import pytest
import typer

from applika.lib import masked_input
from applika.lib.masked_input import _read_masked


def _read(keys: str, capsys) -> tuple[str, str]:
    value = _read_masked(iter(keys))
    return value, capsys.readouterr().out


def test_each_character_echoes_one_star(capsys):
    value, out = _read('abc#xyz\r', capsys)

    assert value == 'abc#xyz'
    assert out == '*******'


def test_backspace_removes_a_character_and_its_star(capsys):
    value, out = _read('abd\x7fc\r', capsys)

    assert value == 'abc'
    assert out == '***\b \b*'


def test_backspace_on_empty_input_does_nothing(capsys):
    value, out = _read('\x7f\bab\n', capsys)

    assert value == 'ab'
    assert out == '**'


def test_control_keys_are_ignored(capsys):
    value, out = _read('a\x1bb\r', capsys)

    assert value == 'ab'
    assert out == '**'


def test_ctrl_c_interrupts(capsys):
    with pytest.raises(KeyboardInterrupt):
        _read_masked(iter('ab\x03'))


def test_ctrl_d_on_empty_input_aborts(capsys):
    with pytest.raises(typer.Abort):
        _read_masked(iter('\x04'))


def test_ctrl_d_after_input_submits_it(capsys):
    assert _read_masked(iter('ab\x04')) == 'ab'


def test_outside_a_terminal_it_is_a_hidden_click_prompt(monkeypatch):
    seen = {}

    def fake_prompt(text, hide_input):
        seen.update(text=text, hide_input=hide_input)
        return 'code#state'

    monkeypatch.setattr(masked_input.sys.stdin, 'isatty', lambda: False)
    monkeypatch.setattr(masked_input.typer, 'prompt', fake_prompt)

    assert masked_input.prompt_masked('Paste it') == 'code#state'
    assert seen == {'text': 'Paste it', 'hide_input': True}
