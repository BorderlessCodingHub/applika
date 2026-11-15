"""MCP token schemas (ADR-0028). The token appears in the creation answer
only, once; the device list never carries it."""

from datetime import datetime

from pydantic import Field, field_validator

from app.application.use_cases.sessions.open_session import DEVICE_NAME_MAX
from app.core.mcp_scopes import McpScope, parse_scope
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema

NAME_TOO_LONG = f'The name is at most {DEVICE_NAME_MAX} characters'


class McpTokenCreate(BaseSchema):
    # Trimmed; blank or absent is "MCP connection".
    name: str | None = Field(default=None, examples=['Claude Code'])
    # Non-empty, known names only, ``read`` always in it.
    scope: list[str] = Field(examples=[['read', 'write']])

    @field_validator('name')
    @classmethod
    def _trim_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if len(trimmed) > DEVICE_NAME_MAX:
            raise ValueError(NAME_TOO_LONG)
        return trimmed

    @field_validator('scope')
    @classmethod
    def _known_scope(cls, value: list[str]) -> list[str]:
        return [scope.value for scope in parse_scope(value)]

    def scopes(self) -> list[McpScope]:
        return [McpScope(name) for name in self.scope]


class McpTokenCreated(BaseSchema):
    id: SnowflakeID
    name: str
    scope: list[str]
    # Shown once: the API never answers it again.
    token: str
    created_at: datetime
    expires_at: datetime
