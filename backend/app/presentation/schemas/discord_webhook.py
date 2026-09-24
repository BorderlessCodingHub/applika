"""Admin report webhook request/response shapes (KODI-025, ADR-0013, T116).

Every field is optional on both the create and the update schema, on
purpose: FastAPI's default ``RequestValidationError`` for a *missing*
required field reports ``input`` as the **whole submitted body** (pydantic
2's own behaviour - verified against this pydantic version), which would put
the submitted ``webhook_url`` into a 422 that has nothing to do with the
URL itself. Making every field optional here means a missing/blank
``webhook_url`` or ``guild_id`` never fails pydantic's own validation - it
reaches the use case, which raises a fixed-string ``BusinessRuleViolation``
(422, ``{"detail": "..."}"``) that never contains the submitted value. A
field that *is* sent with the wrong type still fails pydantic, but the
``input`` on that error is only that field's own value, never the whole
body (confirmed empirically), so ``webhook_url`` never leaks through an
unrelated field's type error either.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.application.dto.discord import DiscordReportWebhookDTO
from app.application.validators.discord_webhook import mask
from app.lib.types import SnowflakeID


class CreateDiscordWebhookSchema(BaseModel):
    webhook_url: str | None = None
    guild_id: str | None = None
    role_ids: list[str] | None = None
    label: str | None = None

    model_config = ConfigDict(extra='ignore')


class UpdateDiscordWebhookSchema(BaseModel):
    webhook_url: str | None = None
    guild_id: str | None = None
    role_ids: list[str] | None = None
    label: str | None = None

    model_config = ConfigDict(extra='ignore')


class DiscordReportWebhookSchema(BaseModel):
    """The **only** shape a report webhook is ever returned in: no field
    here can ever carry the full ``webhook_url`` (AC3)."""

    id: SnowflakeID
    label: str | None = None
    guild_id: SnowflakeID
    role_ids: list[SnowflakeID]
    webhook_url_masked: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(extra='forbid')

    @classmethod
    def from_dto(
        cls, dto: DiscordReportWebhookDTO
    ) -> 'DiscordReportWebhookSchema':
        return cls(
            id=SnowflakeID(dto.id),
            label=dto.label,
            guild_id=SnowflakeID(dto.guild_id),
            role_ids=[SnowflakeID(r) for r in dto.role_ids],
            webhook_url_masked=mask(dto.webhook_url),
            created_at=dto.created_at,
            updated_at=dto.updated_at,
        )
