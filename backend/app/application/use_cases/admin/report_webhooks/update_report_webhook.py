from app.application.dto.report_webhook import ReportWebhookDTO
from app.application.validators.report_webhook import (
    validate_badges,
    validate_label,
    validate_webhook_url,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.report_webhook_repository import (
    ReportWebhookRepository,
)

NOT_FOUND = 'Report webhook not found'


class UpdateReportWebhookUseCase:
    """Partial update. ``fields`` holds only the keys the caller sent. A
    blank ``webhook_url`` keeps the stored one; ``badges`` replaces the set
    and is never empty or null; ``label: null`` clears the label."""

    def __init__(self, webhook_repo: ReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(
        self, webhook_id: int, fields: dict, admin_id: int
    ) -> ReportWebhookDTO:
        webhook = await self.webhook_repo.get_by_id(webhook_id)
        if webhook is None:
            raise ResourceNotFound(NOT_FOUND)

        raw_url = fields.get('webhook_url')
        if raw_url is not None and raw_url.strip():
            webhook.url = validate_webhook_url(raw_url)
        badges = (
            validate_badges(fields['badges']) if 'badges' in fields else None
        )
        if 'label' in fields:
            webhook.label = validate_label(fields['label'])

        webhook = await self.webhook_repo.update(webhook, badges=badges)
        logger.info(
            f'Admin updated report webhook {webhook_id}',
            extra={
                'extra_data': {
                    'event': 'admin_update_report_webhook',
                    'report_webhook_id': webhook_id,
                    'admin_id': admin_id,
                    'fields_updated': sorted(fields),
                }
            },
        )
        return ReportWebhookDTO.model_validate(webhook)
