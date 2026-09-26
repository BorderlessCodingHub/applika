from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)

NOT_FOUND = 'Discord webhook not found'


class DeleteDiscordWebhookUseCase:
    def __init__(self, webhook_repo: DiscordReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(self, webhook_id: int, admin_id: int) -> None:
        webhook = await self.webhook_repo.get_by_id(webhook_id)
        if webhook is None:
            logger.warning(
                f'Admin delete Discord webhook failed: {webhook_id}',
                extra={
                    'extra_data': {
                        'event': 'admin_delete_discord_webhook_failed',
                        'reason': 'discord_webhook_not_found',
                        'discord_webhook_id': webhook_id,
                        'admin_id': admin_id,
                    }
                },
            )
            raise ResourceNotFound(NOT_FOUND)

        await self.webhook_repo.delete(webhook_id)

        logger.info(
            f'Admin deleted Discord report webhook: {webhook_id}',
            extra={
                'extra_data': {
                    'event': 'admin_delete_discord_webhook',
                    'discord_webhook_id': webhook_id,
                    'admin_id': admin_id,
                }
            },
        )
