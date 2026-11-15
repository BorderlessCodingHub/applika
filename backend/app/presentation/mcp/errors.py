"""MCP tool errors (ADR-0028, ADR-0025): the same ``{detail, code}`` body
the REST answer carries, as a tool result with ``isError: true``.

The text block reads ``"<detail> (<code>)"``; ``structuredContent`` is the
REST body itself. One helper, ``error_answer`` in
``presentation/handlers.py``, maps a domain exception for both."""

import json
from typing import Any

from mcp import types
from pydantic import ValidationError

from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.presentation.handlers import (
    error_answer,
    internal_error_body,
    validation_error_body,
)

NOT_FOUND_DETAIL = 'Not Found'
SCOPE_MISSING = (
    "This MCP token's scope does not allow this tool. "
    'Create a token with more access in Applika: Profile > MCP.'
)

# An unknown tool, or a CV tool for a user without "cvs": the body of an
# unknown REST route and of the beta gate (ADR-0018).
NOT_FOUND_BODY: dict[str, Any] = {
    'detail': NOT_FOUND_DETAIL,
    'code': ErrorCode.GEN_NOT_FOUND.value,
}
SCOPE_MISSING_BODY: dict[str, Any] = {
    'detail': SCOPE_MISSING,
    'code': ErrorCode.AUTH_MCP_SCOPE_MISSING.value,
}


def _detail_text(detail: Any) -> str:
    """A validation 422 carries the field list: one ``loc: msg`` each."""
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts = []
        for error in detail:
            if isinstance(error, dict):
                loc = '.'.join(str(part) for part in error.get('loc', ()))
                msg = error.get('msg', '')
                parts.append(f'{loc}: {msg}' if loc else str(msg))
        if parts:
            return '; '.join(parts)
    return json.dumps(detail, ensure_ascii=False)


def tool_error(body: dict[str, Any]) -> types.CallToolResult:
    """``isError: true``, text ``"<detail> (<code>)"``, the body as
    ``structuredContent``."""
    text = f'{_detail_text(body["detail"])} ({body["code"]})'
    return types.CallToolResult(
        content=[types.TextContent(type='text', text=text)],
        structuredContent=body,
        isError=True,
    )


def exception_error(exc: Exception, tool_name: str) -> types.CallToolResult:
    """The tool error for an exception a use case raised: the REST body for
    a domain exception or a validation error, else the REST 500 body."""
    if isinstance(exc, ValidationError):
        return tool_error(validation_error_body(exc.errors(include_url=False)))
    answer = error_answer(exc)
    if answer is not None:
        return tool_error(answer.body)
    logger.error(
        'MCP tool failed',
        exc_info=exc,
        extra={
            'extra_data': {
                'event': 'mcp_tool_failed',
                'tool': tool_name,
                'error': type(exc).__name__,
            }
        },
    )
    return tool_error(internal_error_body())
