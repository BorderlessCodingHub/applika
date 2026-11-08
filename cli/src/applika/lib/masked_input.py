"""Read a secret from the terminal, echoing one ``*`` per character.

Click's ``hide_input`` echoes nothing, so a pasted value looks like it never
arrived. Outside an interactive terminal (a pipe, CI, tests) this falls back
to ``typer.prompt(hide_input=True)``.
"""

from __future__ import annotations

import sys

import typer

MASK = '*'
_ENTER = ('\r', '\n')
_BACKSPACE = ('\x7f', '\b')
_INTERRUPT = '\x03'
_EOF = ('\x04', '\x1a')


def prompt_masked(text: str) -> str:
    """Prompt with ``text: `` and return what was typed, shown as ``*``."""
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        return typer.prompt(text, hide_input=True)
    sys.stdout.write(f'{text}: ')
    sys.stdout.flush()
    reader = _char_reader()
    try:
        value = _read_masked(reader)
    finally:
        # Closing the generator restores the terminal before anything else.
        reader.close()
        sys.stdout.write('\n')
        sys.stdout.flush()
    return value


def _read_masked(next_char) -> str:
    """The editing loop, apart from the terminal so it can be tested."""
    chars: list[str] = []
    for char in next_char:
        if char in _ENTER:
            break
        if char == _INTERRUPT:
            raise KeyboardInterrupt
        if char in _EOF:
            if not chars:
                raise typer.Abort
            break
        if char in _BACKSPACE:
            if chars:
                chars.pop()
                sys.stdout.write('\b \b')
        elif char.isprintable():
            chars.append(char)
            sys.stdout.write(MASK)
        sys.stdout.flush()
    return ''.join(chars)


def _char_reader():
    """Yield the keys pressed, one character at a time, without echo."""
    if sys.platform == 'win32':
        import msvcrt  # noqa: PLC0415

        while True:
            yield msvcrt.getwch()
    else:
        import termios  # noqa: PLC0415
        import tty  # noqa: PLC0415

        fd = sys.stdin.fileno()
        saved = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            while True:
                yield sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, saved)
