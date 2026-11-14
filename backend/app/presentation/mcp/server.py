"""The MCP server (ADR-0028): the official SDK's low-level ``Server`` behind
``StreamableHTTPSessionManager`` (stateless, JSON responses), at the plain
route ``POST /mcp`` (``app/main.py``).

The low-level server, not ``FastMCP``: ``tools/list`` and the instructions
depend on each request's token scope and ``cvs`` feature. ``list_tools`` and
``call_tool`` read the caller from ``server.request_context.request.state``
(set by ``McpAuthGuard``); ``create_initialization_options`` has no request,
so it reads the same caller from ``current_caller``.

A session manager runs once (``run()``), so ``McpRuntime`` builds a fresh
one each time the app's lifespan starts.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from mcp import types
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.types import Receive, Scope, Send

from app.core.mcp_scopes import McpScope
from app.presentation.mcp.auth import (
    PRINCIPAL_STATE_KEY,
    McpAuthGuard,
    McpCaller,
    current_caller,
)
from app.presentation.mcp.registry import ToolRegistry
from app.presentation.mcp.tools import ALL_TOOLS

SERVER_NAME = 'applika'
SERVER_VERSION = '2.2.0'

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


class ApplikaMcpServer(Server[Any, Any]):
    def create_initialization_options(
        self,
        notification_options: NotificationOptions | None = None,
        experimental_capabilities: dict[str, dict[str, Any]] | None = None,
    ) -> InitializationOptions:
        options = super().create_initialization_options(
            notification_options, experimental_capabilities
        )
        options.instructions = build_instructions(current_caller.get())
        return options


def request_caller(server: Server[Any, Any]) -> McpCaller:
    """The caller ``McpAuthGuard`` put on this request's state."""
    request = server.request_context.request
    caller = getattr(getattr(request, 'state', None), PRINCIPAL_STATE_KEY, None)
    if not isinstance(caller, McpCaller):
        raise RuntimeError('MCP request without a caller')
    return caller


def build_server(registry: ToolRegistry) -> ApplikaMcpServer:
    server = ApplikaMcpServer(
        SERVER_NAME,
        version=SERVER_VERSION,
        instructions=build_instructions(None),
    )

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        caller = request_caller(server)
        return [tool.as_mcp() for tool in registry.visible(caller)]

    # Input is validated by each tool's own model (the REST schema), after
    # the scope and ``cvs`` checks, so a refusal never depends on the
    # arguments.
    @server.call_tool(validate_input=False)
    async def call_tool(
        name: str, arguments: dict[str, Any]
    ) -> types.CallToolResult:
        caller = request_caller(server)
        return await registry.call(caller, name, arguments)

    return server


class McpRuntime:
    """The session manager of the running app: built and entered by the
    app's lifespan (``run``), used by the route (``handle``)."""

    def __init__(self, server: Server[Any, Any]) -> None:
        self.server = server
        self._manager: StreamableHTTPSessionManager | None = None

    @asynccontextmanager
    async def run(self) -> AsyncIterator[None]:
        manager = StreamableHTTPSessionManager(
            app=self.server, stateless=True, json_response=True
        )
        async with manager.run():
            self._manager = manager
            try:
                yield
            finally:
                self._manager = None

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._manager is None:
            raise RuntimeError('The MCP session manager is not running')
        await self._manager.handle_request(scope, receive, send)


registry = ToolRegistry(ALL_TOOLS)
mcp_server = build_server(registry)
mcp_runtime = McpRuntime(mcp_server)
# ``POST /mcp``: the token check, then the session manager.
mcp_endpoint = McpAuthGuard(mcp_runtime.handle)
