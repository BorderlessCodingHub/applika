from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.report_webhook_repository import (
    ReportWebhookRepository,
)

NOT_FOUND = 'Report webhook not found'


class DeleteReportWebhookUseCase:
    def __init__(self, webhook_repo: ReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(self, webhook_id: int, admin_id: int) -> None:
        if await self.webhook_repo.get_by_id(webhook_id) is None:
            raise ResourceNotFound(NOT_FOUND, ErrorCode.ADM_WEBHOOK_NOT_FOUND)
        await self.webhook_repo.delete(webhook_id)
        logger.info(
            f'Admin deleted report webhook {webhook_id}',
            extra={
                'extra_data': {
                    'event': 'admin_delete_report_webhook',
                    'report_webhook_id': webhook_id,
                    'admin_id': admin_id,
                }
            },
        )
