from app.application.dto.report_webhook import ReportWebhookDTO
from app.domain.repositories.report_webhook_repository import (
    ReportWebhookRepository,
)


class ListReportWebhooksUseCase:
    def __init__(self, webhook_repo: ReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(self) -> list[ReportWebhookDTO]:
        return [
            ReportWebhookDTO.model_validate(webhook)
            for webhook in await self.webhook_repo.list_all()
        ]
