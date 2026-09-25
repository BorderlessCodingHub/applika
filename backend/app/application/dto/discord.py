from datetime import datetime

from pydantic import BaseModel, Field

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


class ReportRouteDTO(BaseModel):
    """Where a submitted report should be posted (K8).

    Not a ``BaseSchema``: this is a plain value returned by a use case, not
    an entity with an id/created_at. ``webhook_urls`` is ``repr=False`` for
    the same reason as ``DiscordReportWebhookDTO.webhook_url`` - a stray
    ``repr()``/log of this DTO never prints an address (R-030).
    ``discord_id`` is ``None`` when the submitting user has no usable
    connection; ``webhook_urls`` is empty whenever there is nothing to post
    to.
    """

    discord_id: int | None = None
    webhook_urls: list[str] = Field(default_factory=list, repr=False)


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
