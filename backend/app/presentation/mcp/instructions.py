"""The server's instructions (ADR-0028): applika-cli's skill rewritten for
tools, in ``instructions.md``. The ``initialize`` answer carries them
(``server.py``), and so does the ``guide`` tool, for AI apps that do not
show a server's instructions to the model."""

from pathlib import Path

from app.core.mcp_scopes import McpScope
from app.presentation.mcp.auth import McpCaller

_INSTRUCTIONS = (Path(__file__).parent / 'instructions.md').read_text()
_CVS_START = '<!-- cvs:start -->'
_CVS_END = '<!-- cvs:end -->'

_SCOPE_WORDS = {
    McpScope.READ: 'read your applications, timelines, platforms and companies',
    McpScope.WRITE: 'create, edit, close and reopen',
    McpScope.DELETE: 'delete timeline events, master CVs and application CVs',
}


def _without_cvs_part(text: str) -> str:
    start = text.index(_CVS_START)
    end = text.index(_CVS_END) + len(_CVS_END)
    return text[:start] + text[end:].lstrip('\n')


def build_instructions(caller: McpCaller | None) -> str:
    """The CLI skill rewritten for tools: the CV part only for a user with
    ``cvs``, and a closing note on what this token's scope allows. No
    personal data."""
    has_cvs = caller is not None and caller.has_cvs
    text = _INSTRUCTIONS if has_cvs else _without_cvs_part(_INSTRUCTIONS)
    text = text.replace(_CVS_START + '\n', '').replace(_CVS_END + '\n', '')
    if caller is None:
        return text
    held = [scope for scope in McpScope if scope in caller.scopes]
    lines = [
        '',
        '## This connection',
        '',
        'Scope: ' + ', '.join(f'`{scope.value}`' for scope in held) + '.',
    ]
    lines += [f'- `{scope.value}`: {_SCOPE_WORDS[scope]}.' for scope in held]
    missing = [scope for scope in McpScope if scope not in caller.scopes]
    if missing:
        lines.append(
            'Tools that need '
            + ', '.join(f'`{scope.value}`' for scope in missing)
            + ' are not offered. The user can create a token with more '
            'access in Applika (Profile > MCP).'
        )
    return text.rstrip('\n') + '\n' + '\n'.join(lines) + '\n'
