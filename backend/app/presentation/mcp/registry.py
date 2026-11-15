"""The MCP tool registry (ADR-0028).

Each tool is ``(name, required_scope, needs_cvs, handler)`` plus its input
model (the REST request schema) and output schema (the REST response
schema). One scope per tool:

- ``tools/list`` shows a tool only when the token holds its scope and the
  tool either does not need ``cvs`` or the user has it;
- ``tools/call`` answers an unknown tool, or a CV tool for a user without
  ``cvs``, with the unknown-route body (``GEN-1001``), and a tool outside
  the scope with ``AUTH-1052``. Only then is the input validated and the
  use case run.

``read`` tools carry ``readOnlyHint``; ``delete`` tools ``destructiveHint``,
so AI apps ask the user first. Results carry the REST JSON body as text and
as ``structuredContent`` (a list is wrapped as ``{"result": [...]}``: the
spec wants an object).
"""

import base64
import json
from collections.abc import Awaitable, Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import redis.asyncio as redis
from mcp import types
from pydantic import AnyUrl, BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mcp_scopes import McpScope
from app.presentation.mcp.auth import McpCaller
from app.presentation.mcp.deps import deps
from app.presentation.mcp.errors import (
    NOT_FOUND_BODY,
    SCOPE_MISSING_BODY,
    exception_error,
    tool_error,
)


@dataclass(frozen=True)
class ToolContext:
    """What a tool handler acts with: the caller, one database session for
    the call, and the Redis client."""

    caller: McpCaller
    session: AsyncSession
    redis: redis.Redis

    @property
    def user_id(self) -> int:
        return self.caller.user.id


Handler = Callable[[ToolContext, Any], Awaitable[Any]]


@dataclass(frozen=True)
class McpTool:
    name: str
    title: str
    description: str
    scope: McpScope
    input_model: type[BaseModel]
    handler: Handler
    needs_cvs: bool = False
    output_schema: dict[str, Any] | None = None
    # Applied to the raw arguments before validation (e.g. CV item ids).
    prepare: Callable[[dict[str, Any]], dict[str, Any]] | None = None
    # Applied to the published input schema (e.g. ids made optional).
    input_schema_hook: Callable[[dict[str, Any]], dict[str, Any]] | None = None

    def input_schema(self) -> dict[str, Any]:
        schema = self.input_model.model_json_schema()
        if self.input_schema_hook is not None:
            schema = self.input_schema_hook(schema)
        return schema

    def annotations(self) -> types.ToolAnnotations:
        if self.scope is McpScope.READ:
            return types.ToolAnnotations(
                title=self.title, readOnlyHint=True, openWorldHint=False
            )
        return types.ToolAnnotations(
            title=self.title,
            readOnlyHint=False,
            destructiveHint=self.scope is McpScope.DELETE,
            openWorldHint=False,
        )

    def as_mcp(self) -> types.Tool:
        return types.Tool(
            name=self.name,
            title=self.title,
            description=self.description,
            inputSchema=self.input_schema(),
            outputSchema=self.output_schema,
            annotations=self.annotations(),
        )


# --- results -----------------------------------------------------------------


def to_json(value: Any) -> Any:
    """The JSON the REST route answers for ``value``: models as FastAPI
    serializes a ``response_model`` (``mode='json'``, aliases)."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode='json', by_alias=True)
    if isinstance(value, (list, tuple)):
        return [to_json(item) for item in value]
    if isinstance(value, dict):
        return {key: to_json(item) for key, item in value.items()}
    return value


def json_result(value: Any) -> types.CallToolResult:
    """The REST body as text, and as ``structuredContent`` (an object; a
    list becomes ``{"result": [...]}``)."""
    payload = to_json(value)
    structured = payload if isinstance(payload, dict) else {'result': payload}
    return types.CallToolResult(
        content=[
            types.TextContent(
                type='text', text=json.dumps(payload, ensure_ascii=False)
            )
        ],
        structuredContent=structured,
        isError=False,
    )


def markdown_result(content: str) -> types.CallToolResult:
    return types.CallToolResult(
        content=[types.TextContent(type='text', text=content)],
        isError=False,
    )


def pdf_result(content: bytes, filename: str) -> types.CallToolResult:
    """A PDF as an embedded resource, ``application/pdf``, base64."""
    return types.CallToolResult(
        content=[
            types.EmbeddedResource(
                type='resource',
                resource=types.BlobResourceContents(
                    uri=AnyUrl(f'applika://files/{quote(filename)}'),
                    mimeType='application/pdf',
                    blob=base64.b64encode(content).decode('ascii'),
                ),
            )
        ],
        isError=False,
    )


# --- output schemas ------------------------------------------------------------


def _serialization_schema(model: type[BaseModel]) -> dict[str, Any]:
    return model.model_json_schema(mode='serialization')


def object_output(model: type[BaseModel]) -> dict[str, Any]:
    return _serialization_schema(model)


def list_output(model: type[BaseModel]) -> dict[str, Any]:
    """``{"result": [<model>]}``, with the model's ``$defs`` at the root."""
    item = _serialization_schema(model)
    defs = item.pop('$defs', None)
    schema: dict[str, Any] = {
        'type': 'object',
        'properties': {'result': {'type': 'array', 'items': item}},
        'required': ['result'],
    }
    if defs:
        schema['$defs'] = defs
    return schema


def any_of_output(*models: type[BaseModel]) -> dict[str, Any]:
    """One of several REST bodies (``add_timeline_event`` answers the event,
    or the application it closed)."""
    defs: dict[str, Any] = {}
    options = []
    for model in models:
        option = _serialization_schema(model)
        defs.update(option.pop('$defs', {}))
        options.append(option)
    schema: dict[str, Any] = {'type': 'object', 'anyOf': options}
    if defs:
        schema['$defs'] = defs
    return schema


DELETED_OUTPUT: dict[str, Any] = {
    'type': 'object',
    'properties': {'deleted': {'type': 'boolean', 'const': True}},
    'required': ['deleted'],
}


def deleted() -> dict[str, Any]:
    """A REST 204 has no body; a tool answers ``{"deleted": true}``."""
    return {'deleted': True}


# --- the registry ---------------------------------------------------------------


def _check_unique(tools: Sequence[McpTool]) -> None:
    names = [tool.name for tool in tools]
    duplicates = {name for name in names if names.count(name) > 1}
    if duplicates:
        raise ValueError(f'Duplicate MCP tool names: {sorted(duplicates)}')


class ToolRegistry:
    def __init__(self, tools: Iterable[McpTool]) -> None:
        self.tools: tuple[McpTool, ...] = tuple(tools)
        _check_unique(self.tools)
        self._by_name = {tool.name: tool for tool in self.tools}

    def get(self, name: str) -> McpTool | None:
        return self._by_name.get(name)

    def visible(self, caller: McpCaller) -> list[McpTool]:
        """The tools this caller's scope and ``cvs`` feature allow."""
        return [
            tool
            for tool in self.tools
            if tool.scope in caller.scopes
            and (caller.has_cvs or not tool.needs_cvs)
        ]

    def refusal(
        self, caller: McpCaller, name: str
    ) -> types.CallToolResult | None:
        """Why this caller may not run ``name``, or None when it may."""
        tool = self._by_name.get(name)
        if tool is None or (tool.needs_cvs and not caller.has_cvs):
            return tool_error(dict(NOT_FOUND_BODY))
        if tool.scope not in caller.scopes:
            return tool_error(dict(SCOPE_MISSING_BODY))
        return None

    async def call(
        self, caller: McpCaller, name: str, arguments: dict[str, Any] | None
    ) -> types.CallToolResult:
        refused = self.refusal(caller, name)
        if refused is not None:
            return refused
        tool = self._by_name[name]
        raw = dict(arguments or {})
        if tool.prepare is not None:
            raw = tool.prepare(raw)
        try:
            args = tool.input_model.model_validate(raw)
        except ValidationError as exc:
            return exception_error(exc, tool.name)
        async with deps.session_factory() as session:
            context = ToolContext(
                caller=caller, session=session, redis=deps.redis_factory()
            )
            try:
                output = await tool.handler(context, args)
            except Exception as exc:
                await session.rollback()
                return exception_error(exc, tool.name)
        if isinstance(output, types.CallToolResult):
            return output
        return json_result(output)
