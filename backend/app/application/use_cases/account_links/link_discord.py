from datetime import datetime, timedelta, timezone

from app.application.dto.discord import DiscordConnectionDTO
from app.application.services.discord_oauth_service import (
    DiscordGrant,
    DiscordOAuthService,
    DiscordProfile,
    DiscordUnavailable,
)
from app.core.crypto import encrypt_discord_token
from app.core.exceptions import ResourceConflict
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)


def _expires_at(expires_in: int) -> datetime | None:
    if not expires_in:
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in)


class LinkDiscordUseCase:
    """Connect or reconnect Discord (T097, T103). The conflict and
    reconnect-in-place rules live in the repository."""

    def __init__(
        self,
        conn_repo: DiscordConnectionRepository,
        discord_oauth: DiscordOAuthService,
    ):
        self.conn_repo = conn_repo
        self.discord_oauth = discord_oauth

    async def execute(
        self, user_id: int, grant: DiscordGrant, profile: DiscordProfile
    ) -> DiscordConnectionDTO:
        encrypted_refresh_token = encrypt_discord_token(grant.refresh_token)
        if encrypted_refresh_token is None:
            # Unreachable in practice: begin/callback already require
            # ``is_configured()`` (id + secret + key) before this runs.
            raise DiscordUnavailable(
                'Discord token encryption is not configured'
            )

        try:
            connection = await self.conn_repo.link(
                user_id=user_id,
                discord_id=profile.id,
                username=profile.username,
                global_name=profile.global_name,
                avatar=profile.avatar,
                scopes=grant.scope,
                encrypted_refresh_token=encrypted_refresh_token,
                access_token_expires_at=_expires_at(grant.expires_in),
            )
        except ResourceConflict:
            # Another user already owns this Discord id: the new grant is
            # revoked best-effort (T097/T101), both users stay unchanged.
            await self.discord_oauth.revoke(grant.refresh_token)
            raise

        return DiscordConnectionDTO.model_validate(connection)
