from app.application.dto.report_webhook import ReportWebhookDTO
from app.application.validators.report_webhook import (
    validate_badges,
    validate_label,
    validate_webhook_url,
)
from app.config.logging import logger
from app.domain.repositories.report_webhook_repository import (
    ReportWebhookRepository,
)


class CreateReportWebhookUseCase:
    """A webhook address, one or more badges (BASE, PSP or both, never
    none) and an optional label. Logs name the webhook id, never the URL."""

    def __init__(self, webhook_repo: ReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(
        self,
        *,
        webhook_url: str | None,
        badges: list[str] | None,
        label: str | None,
        admin_id: int,
    ) -> ReportWebhookDTO:
        url = validate_webhook_url(webhook_url)
        badge_keys = validate_badges(badges)
        webhook = await self.webhook_repo.create(
            url=url, label=validate_label(label), badges=badge_keys
        )
        logger.info(
            f'Admin created report webhook {webhook.id}',
            extra={
                'extra_data': {
                    'event': 'admin_create_report_webhook',
                    'report_webhook_id': webhook.id,
                    'admin_id': admin_id,
                }
            },
        )
        return ReportWebhookDTO.model_validate(webhook)
