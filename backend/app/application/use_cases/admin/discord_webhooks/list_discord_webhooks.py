from app.application.dto.discord import DiscordReportWebhookDTO
from app.config.logging import logger
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)


class ListDiscordWebhooksUseCase:
    def __init__(self, webhook_repo: DiscordReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(self, admin_id: int) -> list[DiscordReportWebhookDTO]:
        logger.info(
            'Admin listed Discord report webhooks',
            extra={
                'extra_data': {
                    'event': 'admin_list_discord_webhooks',
                    'admin_id': admin_id,
                }
            },
        )
        webhooks = await self.webhook_repo.list_all()
        return [DiscordReportWebhookDTO.model_validate(w) for w in webhooks]
