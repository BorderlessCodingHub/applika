"""DTOs of the device sessions (ADR-0019): what the session use cases
return to the routers. The refresh value never appears in a ``repr`` and
never in the device list. ``cli`` and its sign-in methods name applika-cli
sessions kept as history (ADR-0028)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ``mcp``: an MCP token, one long-lived secret with a scope (ADR-0028).
ClientType = Literal['web', 'cli', 'mcp']
# ``github_web`` stays: ended rows from before ADR-0024 are still listed.
SignInMethod = Literal[
    'github_web',
    'cli_browser',
    'cli_device',
    'cli_legacy',
    'borderless',
    'mcp_token',
]
# ``borderless_revoked``: a web session Borderless's refusal of applika's
# grant ended (ADR-0026 §9).
EndReason = Literal[
    'logout',
    'revoked',
    'expired',
    'github_revoked',
    'replaced',
    'borderless_revoked',
]
SessionStatus = Literal['active', 'signed_out', 'revoked', 'expired']


class SessionTokensDTO(BaseModel):
    """A session's credentials, as sign-in or refresh hands them out.

    ``access_token`` is the JWT (``sid`` = ``session_id``);
    ``refresh_token`` is the session's uuid7, unchanged on refresh."""

    session_id: int
    user_id: int
    access_token: str = Field(repr=False)
    access_expires_in: int
    refresh_token: str = Field(repr=False)
    refresh_expires_in: int


class SessionListItemDTO(BaseModel):
    """One row of ``GET /users/me/sessions``."""

    id: int
    client_type: ClientType
    sign_in_method: SignInMethod
    device_name: str
    client_label: str
    created_ip: str | None
    last_ip: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
    ended_at: datetime | None
    status: SessionStatus
    current: bool
    # An MCP token's scope names; None on web and CLI sessions. Never the
    # token itself.
    scope: list[str] | None = None
