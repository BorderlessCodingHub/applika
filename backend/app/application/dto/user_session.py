"""DTOs of the device sessions (KODI-057, ADR-0019): what the session and
CLI sign-in use cases return to the routers. The refresh value never appears
in a ``repr`` and never in the device list."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ClientType = Literal['web', 'cli']
SignInMethod = Literal['github_web', 'cli_browser', 'cli_device', 'cli_legacy']
EndReason = Literal[
    'logout', 'revoked', 'expired', 'github_revoked', 'replaced'
]
SessionStatus = Literal['active', 'signed_out', 'revoked', 'expired']


class SessionTokensDTO(BaseModel):
    """A session's credentials, as sign-in or refresh hands them out.

    ``access_token`` is the JWT (``sid`` = ``session_id``);
    ``refresh_token`` is the session's uuid7, unchanged on refresh."""

    session_id: int
    github_id: int
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


class DeviceRequestDTO(BaseModel):
    """A pending device code as the approval page shows it (R-017)."""

    device_name: str
    client_label: str
    ip: str | None
    requested_at: datetime
    expires_at: datetime


class DeviceCodeDTO(BaseModel):
    """``POST /auth/device/code``: RFC 8628 section 3.2."""

    device_code: str = Field(repr=False)
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int
