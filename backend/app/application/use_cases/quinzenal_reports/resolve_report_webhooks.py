"""Resolve which report webhooks a submitted report reaches (ADR-0024).

The owner: "the webhook will use those roles to determine which webhook to
report the status". A report goes to every webhook assigned to a badge the
user holds (``badge_access``: a live row while the Borderless access is
alive and not refused). A webhook with no badge receives nothing. URLs are
distinct, oldest webhook first, and never logged.
"""

from app.application.use_cases.borderless.badge_access import badge_access
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.report_webhook_repository import (
    ReportWebhookRepository,
)
from app.domain.repositories.user_badge_repository import UserBadgeRepository


class ResolveReportWebhooksUseCase:
    def __init__(
        self,
        binding_repo: BorderlessAccountRepository,
        badge_repo: UserBadgeRepository,
        webhook_repo: ReportWebhookRepository,
    ):
        self.binding_repo = binding_repo
        self.badge_repo = badge_repo
        self.webhook_repo = webhook_repo

    async def execute(self, user_id: int) -> list[str]:
        access = badge_access(
            await self.binding_repo.get_by_user_id(user_id),
            await self.badge_repo.live_for_user(user_id),
        )
        if not access.held:
            return []
        webhooks = await self.webhook_repo.list_by_badges(access.held_badges)
        urls: list[str] = []
        for webhook in webhooks:
            if webhook.url not in urls:
                urls.append(webhook.url)
        return urls
