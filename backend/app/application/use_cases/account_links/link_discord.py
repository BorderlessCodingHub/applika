from datetime import datetime, timedelta, timezone

from app.application.dto.discord import DiscordConnectionDTO
from app.application.services.discord_oauth_service import (
    DiscordGrant,
    DiscordProfile,
    DiscordUnavailable,
)
from app.core.crypto import encrypt_discord_token
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)


def _expires_at(expires_in: int) -> datetime | None:
    if not expires_in:
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in)


class LinkDiscordUseCase:
    """Connect, reconnect or transfer Discord (T097, T101, T103).

    Reopened 2026-09-24 for the R-008 rewrite: this use case calls nothing
    at Discord, in any outcome. A Discord id already held by another user is
    a *transfer* handled entirely inside ``conn_repo.link`` - that user's
    row is deleted and the caller's row is written with the caller's new
    grant, and no revoke is issued: revoking the refresh token could cancel
    the caller's own just-granted access, since it is the same Discord user
    authorizing the same app. A genuine two-user race still surfaces as
    ``ResourceConflict`` from the repository and is re-raised unchanged -
    also with no revoke, for the same reason.
    """

    def __init__(self, conn_repo: DiscordConnectionRepository):
        self.conn_repo = conn_repo

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

        return DiscordConnectionDTO.model_validate(connection)
