from datetime import datetime

from app.application.dto import BaseSchema
from app.core.enums import DiscordConnectionStatus


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
