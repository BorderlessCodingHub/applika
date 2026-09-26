from app.application.dto.discord import DiscordReportWebhookDTO
from app.application.validators.discord_webhook import (
    validate_guild_id,
    validate_label,
    validate_role_ids,
    validate_webhook_url,
)
from app.config.logging import logger
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)


class CreateDiscordWebhookUseCase:
    """T115. Validates before any I/O, so a bad payload never reaches the
    database and an asyncpg ``IntegrityError`` (which would carry the URL in
    its ``DETAIL``) is only ever the duplicate-URL race, not a format
    mistake (AC2)."""

    def __init__(self, webhook_repo: DiscordReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(
        self,
        webhook_url: str | None,
        guild_id: str | None,
        role_ids: list[str] | None,
        label: str | None,
        admin_id: int,
    ) -> DiscordReportWebhookDTO:
        clean_url = validate_webhook_url(webhook_url)
        clean_guild_id = validate_guild_id(guild_id)
        clean_role_ids = validate_role_ids(role_ids)
        clean_label = validate_label(label)

        webhook = await self.webhook_repo.create(
            webhook_url=clean_url,
            guild_id=clean_guild_id,
            role_ids=clean_role_ids,
            label=clean_label,
        )

        logger.info(
            f'Admin created Discord report webhook: {webhook.id}',
            extra={
                'extra_data': {
                    'event': 'admin_create_discord_webhook',
                    'discord_webhook_id': webhook.id,
                    'guild_id': webhook.guild_id,
                    'admin_id': admin_id,
                }
            },
        )

        return DiscordReportWebhookDTO.model_validate(webhook)
