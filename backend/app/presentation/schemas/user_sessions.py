"""Device list schemas (KODI-057, ADR-0019). Ids are Snowflake strings on
the wire (ADR-0003). No refresh value, no user agent string."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class UserSessionOut(BaseSchema):
    id: SnowflakeID
    client_type: Literal['web', 'cli']
    sign_in_method: Literal[
        'github_web', 'cli_browser', 'cli_device', 'cli_legacy'
    ]
    device_name: str
    client_label: str
    created_ip: str | None
    last_ip: str | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
    ended_at: datetime | None
    status: Literal['active', 'signed_out', 'revoked', 'expired']
    current: bool


class RevokeOthersOut(BaseModel):
    revoked: int
