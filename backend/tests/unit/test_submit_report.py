"""Unit tests for ``SubmitReportUseCase`` (KODI-026 backend-qa B1/B2).

Fakes stand in for the repository, the Discord service and
``ResolveReportWebhooksUseCase``, so these tests run without a database or
network and can assert what the real integration suite cannot: the exact
call order (the report is saved before Discord is ever contacted, R-028)
and that a Discord-side exception - not just a returned ``(False, error)``
tuple - never escapes ``execute`` (T126, "a Discord failure never raises").
"""

from datetime import date
from typing import cast

import pytest

from app.application.dto.quinzenal_report import SubmitReportPayloadDTO
from app.application.services.discord_service import DiscordService
from app.application.use_cases.quinzenal_reports.resolve_report_webhooks import (
    ResolveReportWebhooksUseCase,
)
from app.application.use_cases.quinzenal_reports.submit_report import (
    SubmitReportUseCase,
)
from app.domain.models import QuinzenalReportModel
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)


def _use_case(
    report_repo, discord_service, resolve_webhooks
) -> SubmitReportUseCase:
    return SubmitReportUseCase(
        cast(QuinzenalReportRepository, report_repo),
        cast(DiscordService, discord_service),
        cast(ResolveReportWebhooksUseCase, resolve_webhooks),
    )


_FORTNIGHT_METRICS = {
    'applications_count': 0,
    'callback_rate': 0,
    'initial_screenings_count': 0,
    'interviews_completed_fortnight': 0,
    'active_processes_count': 0,
    'offers_count': 0,
    'offer_rate': 0,
}
_ACCUMULATED_METRICS = {
    'total_applications_count': 0,
    'overall_conversion_rate': 0,
    'total_initial_screenings_count': 0,
}


class FakeReportRepo:
    def __init__(self, calls: list[str]):
        self.calls = calls
        self.next_id = 1
        self.updated: QuinzenalReportModel | None = None

    async def get_all_by_user_id(self, user_id):
        return []

    async def calculate_fortnight_metrics(self, **kwargs):
        return dict(_FORTNIGHT_METRICS)

    async def calculate_accumulated_metrics(self, **kwargs):
        return dict(_ACCUMULATED_METRICS)

    async def create(self, report: QuinzenalReportModel):
        self.calls.append('report_repo.create')
        report.id = self.next_id
        return report

    async def update(self, report: QuinzenalReportModel):
        self.calls.append('report_repo.update')
        self.updated = report
        return report


class FakeResolveWebhooks:
    def __init__(
        self,
        calls: list[str],
        urls: list[str] | None = None,
        raises: Exception | None = None,
    ):
        self.calls = calls
        self.urls = urls or []
        self.raises = raises

    async def execute(self, user_id):
        self.calls.append('resolve_webhooks.execute')
        if self.raises:
            raise self.raises
        return self.urls


class FakeDiscordService:
    def __init__(
        self,
        calls: list[str],
        result: tuple[bool, str | None] = (True, None),
        raises: Exception | None = None,
    ):
        self.calls = calls
        self.result = result
        self.raises = raises
        self.posted_urls: list[str | None] = []
        self.messages: list[str] = []

    async def post_report_message(
        self, message, webhook_url=None
    ):
        self.calls.append('discord_service.post_report_message')
        self.messages.append(message)
        self.posted_urls.append(webhook_url)
        if self.raises:
            raise self.raises
        return self.result


def _payload() -> SubmitReportPayloadDTO:
    return SubmitReportPayloadDTO(
        mock_interviews_count=1,
        linkedin_posts_count=1,
        strategic_connections_count=1,
        biggest_win='win',
        biggest_challenge='challenge',
        next_fortnight_goal='goal',
        start_date=date.today(),
    )


@pytest.mark.asyncio
async def test_report_is_saved_before_discord_is_contacted():
    calls: list[str] = []
    report_repo = FakeReportRepo(calls)
    resolve_webhooks = FakeResolveWebhooks(calls)
    discord_service = FakeDiscordService(calls)
    use_case = _use_case(report_repo, discord_service, resolve_webhooks)

    await use_case.execute(1, 'ada', 1, _payload())

    assert calls[0] == 'report_repo.create'
    assert calls.index('report_repo.create') < calls.index(
        'resolve_webhooks.execute'
    )


@pytest.mark.asyncio
async def test_resolve_webhooks_exception_never_escapes_and_report_still_saved():
    calls: list[str] = []
    report_repo = FakeReportRepo(calls)
    resolve_webhooks = FakeResolveWebhooks(calls, raises=ValueError('boom'))
    discord_service = FakeDiscordService(calls)
    use_case = _use_case(report_repo, discord_service, resolve_webhooks)

    result = await use_case.execute(1, 'ada', 1, _payload())

    assert result.success is True
    assert result.discord_posted is False
    assert 'report_repo.create' in calls
    assert 'discord_service.post_report_message' not in calls


@pytest.mark.asyncio
async def test_post_report_message_exception_never_escapes():
    calls: list[str] = []
    report_repo = FakeReportRepo(calls)
    resolve_webhooks = FakeResolveWebhooks(
        calls, urls=['https://hook/a', 'https://hook/b']
    )
    discord_service = FakeDiscordService(
        calls, raises=RuntimeError('connection dropped')
    )
    use_case = _use_case(report_repo, discord_service, resolve_webhooks)

    result = await use_case.execute(1, 'ada', 1, _payload())

    assert result.success is True
    assert result.discord_posted is False
    assert result.discord_error is not None
    assert 'https://hook' not in result.discord_error
    # Both configured URLs were still attempted, one failure each.
    assert discord_service.posted_urls == ['https://hook/a', 'https://hook/b']


@pytest.mark.asyncio
async def test_report_post_names_the_username_and_mentions_nobody():
    """ADR-0024: the post carries the applika username and no ``<@id>``."""
    calls: list[str] = []
    report_repo = FakeReportRepo(calls)
    resolve_webhooks = FakeResolveWebhooks(calls, urls=['https://hook/a'])
    discord_service = FakeDiscordService(calls)
    use_case = _use_case(report_repo, discord_service, resolve_webhooks)

    result = await use_case.execute(1, 'ada', 1, _payload())

    assert result.discord_posted is True
    [message] = discord_service.messages
    assert '- @ada\n' in message
    assert '<@' not in message
