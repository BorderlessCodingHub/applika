"""Resolve which report webhooks a submitted report should reach (K8,
ADR-0013).

The owner's words: "when a user created a report, if this user connected
their account with discord, my application needs to use the refresh token
to get an access token and get a list of server ids this user is in
discord, with list list i fetch from this new table all web hooks
configured to the server id i fetched from my user, and then check if an
admin have limited by roles id, i also need's to check if this user have
the role id in that server, with everyting done, i then send the repport
message in the webhooks".

Discord server membership, plus the optional role restriction, is the
*only* rule that decides where a report is posted (R-040) - there is no
GitHub org check, no CLI, no single reports-webhook setting any more. The
access token, the guild ids and the role ids are read fresh on every call
and never stored or logged (R-042/R-014); only the encrypted, rotated
refresh token is persisted, by ``store_grant``.
"""

from datetime import datetime, timedelta, timezone

from app.application.dto.discord import ReportRouteDTO
from app.application.services.discord_oauth_service import (
    DiscordGrantRevoked,
    DiscordOAuthService,
    DiscordUnavailable,
)
from app.core.crypto import decrypt_discord_token, encrypt_discord_token
from app.core.enums import DiscordConnectionStatus
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)

_EMPTY = ReportRouteDTO(discord_id=None, webhook_urls=[])


class ResolveReportWebhooksUseCase:
    def __init__(
        self,
        conn_repo: DiscordConnectionRepository,
        webhook_repo: DiscordReportWebhookRepository,
        discord_oauth: DiscordOAuthService,
    ):
        self.conn_repo = conn_repo
        self.webhook_repo = webhook_repo
        self.discord_oauth = discord_oauth

    async def execute(self, user_id: int) -> ReportRouteDTO:
        if not self.discord_oauth.is_configured():
            return _EMPTY

        connection = await self.conn_repo.get_by_user_id_for_update(user_id)
        if connection is None:
            return _EMPTY

        if connection.status == DiscordConnectionStatus.NEEDS_RECONNECT:
            await self.conn_repo.rollback()
            return _EMPTY

        if 'guilds' not in connection.scopes.split():
            # Plan Risk: stored scopes lack ``guilds`` (a stale connection
            # from before KODI-024's scope widened) - routing is impossible.
            await self.conn_repo.mark_needs_reconnect(user_id)
            return _EMPTY

        refresh_token = decrypt_discord_token(
            connection.encrypted_refresh_token
        )
        if refresh_token is None:
            # The encryption key was replaced - the stored token can never
            # be read back.
            await self.conn_repo.mark_needs_reconnect(user_id)
            return _EMPTY

        try:
            grant = await self.discord_oauth.refresh(refresh_token)
        except DiscordGrantRevoked:
            await self.conn_repo.mark_needs_reconnect(user_id)
            return _EMPTY
        except DiscordUnavailable:
            await self.conn_repo.rollback()
            return _EMPTY

        new_encrypted_token = encrypt_discord_token(grant.refresh_token)
        if new_encrypted_token is None:
            await self.conn_repo.rollback()
            return _EMPTY

        access_token_expires_at = None
        if grant.expires_in:
            access_token_expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=grant.expires_in
            )

        # Store the rotated refresh token BEFORE any further Discord call
        # (R-017).
        await self.conn_repo.store_grant(
            user_id,
            new_encrypted_token,
            access_token_expires_at,
            grant.scope,
        )

        discord_id = connection.discord_id
        access_token = grant.access_token  # local only, never stored/logged

        try:
            guild_ids = await self.discord_oauth.list_guild_ids(access_token)
        except DiscordUnavailable:
            return ReportRouteDTO(discord_id=discord_id, webhook_urls=[])

        if not guild_ids:
            return ReportRouteDTO(discord_id=discord_id, webhook_urls=[])

        webhooks = await self.webhook_repo.list_by_guild_ids(list(guild_ids))
        if not webhooks:
            return ReportRouteDTO(discord_id=discord_id, webhook_urls=[])

        role_ids_by_guild: dict[int, set[int] | None] = {}
        kept = []
        for webhook in webhooks:
            if not webhook.role_ids:
                kept.append(webhook)
                continue

            guild_id = webhook.guild_id
            if guild_id not in role_ids_by_guild:
                try:
                    role_ids_by_guild[
                        guild_id
                    ] = await self.discord_oauth.get_member_role_ids(
                        access_token, guild_id
                    )
                except DiscordUnavailable:
                    # A failure drops only this guild's role-limited hooks.
                    role_ids_by_guild[guild_id] = None

            user_role_ids = role_ids_by_guild[guild_id]
            if user_role_ids is None:
                continue
            if user_role_ids & set(webhook.role_ids):
                kept.append(webhook)

        kept.sort(key=lambda webhook: webhook.created_at)
        urls: list[str] = []
        seen: set[str] = set()
        for webhook in kept:
            if webhook.webhook_url not in seen:
                seen.add(webhook.webhook_url)
                urls.append(webhook.webhook_url)

        return ReportRouteDTO(discord_id=discord_id, webhook_urls=urls)
