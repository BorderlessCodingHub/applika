from datetime import datetime

from pydantic import Field

from app.application.dto import BaseSchema
from app.core.enums import DiscordConnectionStatus


class DiscordReportWebhookDTO(BaseSchema):
    """The internal shape of a report webhook row (KODI-025, ADR-0013).

    ``webhook_url`` is ``repr=False`` so a stray ``repr()``/log of the DTO
    (a debugger, an unguarded ``logger.info(dto)``) never prints the full
    address (AC3/R-030) - callers still read ``.webhook_url`` to mask it
    themselves (``app/application/validators/discord_webhook.py:mask``).
    """

    guild_id: int
    webhook_url: str = Field(repr=False)
    role_ids: list[int] = []
    label: str | None = None


class DiscordConnectionDTO(BaseSchema):
    """The public shape of a Discord connection row (KODI-024). Never the
    token: ``encrypted_refresh_token`` is not a field here."""

    user_id: int
    discord_id: int
    username: str
    global_name: str | None = None
    avatar: str | None = None
    scopes: str
    access_token_expires_at: datetime | None = None
    status: DiscordConnectionStatus
    linked_at: datetime
