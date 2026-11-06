"""Feedback posts (ADR-0024): the applika username, no mention, and the
one configured feedback webhook.

``DiscordFeedbackServiceDp`` is overridden with a recording fake so no
test hits a real webhook.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.discord_service import DiscordService
from app.config.settings import envs
from app.domain.models import UserFeedbackModel
from app.main import app as main_app
from app.presentation.dependencies import (
    get_discord_feedback_service,
    get_discord_service,
)
from tests import msg
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless


class FakeDiscordFeedbackService:
    def __init__(self) -> None:
        self.messages: list[str] = []
        self.urls: list[str | None] = []

    async def post_report_message(
        self, message: str, webhook_url: str | None = None
    ) -> tuple[bool, str | None]:
        self.messages.append(message)
        self.urls.append(webhook_url)
        return True, None


@pytest.fixture
def feedback_service():
    fake = FakeDiscordFeedbackService()
    main_app.dependency_overrides[get_discord_feedback_service] = lambda: fake
    yield fake
    main_app.dependency_overrides.pop(get_discord_feedback_service, None)


async def test_feedback_is_saved_and_posted_with_the_username_only(
    async_client: AsyncClient,
    db_session: AsyncSession,
    feedback_service: FakeDiscordFeedbackService,
):
    # A badge holder with a binding still gets no mention of any kind.
    await bind_borderless(db_session, base_data()['user'].id)

    response = await async_client.post(
        '/feedbacks', json={'score': 4, 'text': 'nice'}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    [message] = feedback_service.messages
    header = message.splitlines()[0]
    username = base_data()['user'].username
    assert header == f'\U0001f4ac **USER FEEDBACK** - @{username}', msg(
        'username header with no mention', header
    )
    assert '<@' not in message
    # The route's own service posts to the one configured webhook.
    assert feedback_service.urls == [None]
    count = await db_session.scalar(
        select(func.count()).select_from(UserFeedbackModel)
    )
    assert count == 1


def test_feedback_service_posts_to_the_configured_feedback_webhook(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        envs, 'DISCORD_FEEDBACK_WEBHOOK', 'https://discord.test/feedback'
    )
    service = get_discord_feedback_service()
    assert isinstance(service, DiscordService)
    assert service.webhook_url == 'https://discord.test/feedback'
    assert get_discord_service().webhook_url is None


async def test_post_payload_mentions_nobody(monkeypatch: pytest.MonkeyPatch):
    captured: dict = {}

    def fake_post(self, payload, webhook_url):
        captured['payload'] = payload
        captured['url'] = webhook_url
        return True, None

    monkeypatch.setattr(DiscordService, '_post_message', fake_post)
    service = DiscordService(webhook_url='https://discord.test/feedback')

    assert await service.post_report_message('hello') == (True, None)
    assert captured == {
        'payload': {'content': 'hello', 'allowed_mentions': {'parse': []}},
        'url': 'https://discord.test/feedback',
    }
