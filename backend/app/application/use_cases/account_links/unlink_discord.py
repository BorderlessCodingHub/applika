from app.application.services.discord_oauth_service import (
    DiscordOAuthService,
)
from app.core.crypto import decrypt_discord_token
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)


class UnlinkDiscordUseCase:
    """Disconnect Discord (T102): delete the row, then revoke the stored
    grant best-effort. Idempotent - an unlinked user is a no-op with no HTTP
    call at all."""

    def __init__(
        self,
        conn_repo: DiscordConnectionRepository,
        discord_oauth: DiscordOAuthService,
    ):
        self.conn_repo = conn_repo
        self.discord_oauth = discord_oauth

    async def execute(self, user_id: int) -> None:
        connection = await self.conn_repo.get_by_user_id_for_update(user_id)
        if connection is None:
            return

        encrypted_refresh_token = connection.encrypted_refresh_token
        await self.conn_repo.delete_by_user_id(user_id)

        if not self.discord_oauth.is_configured():
            return

        refresh_token = decrypt_discord_token(encrypted_refresh_token)
        if refresh_token is None:
            return

        await self.discord_oauth.revoke(refresh_token)
