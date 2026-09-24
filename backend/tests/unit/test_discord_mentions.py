"""Unit tests for KODI-021: linked users mentioned in report/feedback posts.

``DiscordService._post_message`` is patched so no test ever makes a real
network call. Covers T045: the service's ``allowed_mentions`` payload with
and without ``mention_user_id``, that ``parse`` never carries ``everyone``,
``roles`` or ``users``, and that the report/feedback header is mention-free
and byte-identical to today's string when the user is unlinked.
"""

from unittest.mock import patch

import pytest

from app.application.dto.quinzenal_report import (
    ReportMetricsDTO,
    SubmitReportPayloadDTO,
)
from app.application.services.discord_service import DiscordService
from app.application.use_cases.quinzenal_reports.submit_report import (
    SubmitReportUseCase,
)
from app.application.use_cases.user_feedbacks.submit_feedback import (
    SubmitFeedbackUseCase,
)

# --- DiscordService payload (T041) ---


@pytest.mark.asyncio
async def test_post_message_without_mention_keeps_parse_empty():
    service = DiscordService(webhook_url='https://discord.test/webhook')
    captured = {}

    def fake_post(payload):
        captured['payload'] = payload
        return True, None

    with patch.object(service, '_post_message', side_effect=fake_post):
        await service.post_report_message('hello')

    assert captured['payload']['allowed_mentions'] == {'parse': []}
    assert 'users' not in captured['payload']['allowed_mentions']


@pytest.mark.asyncio
async def test_post_message_with_mention_adds_users_only():
    service = DiscordService(webhook_url='https://discord.test/webhook')
    captured = {}

    def fake_post(payload):
        captured['payload'] = payload
        return True, None

    with patch.object(service, '_post_message', side_effect=fake_post):
        await service.post_report_message('hello', mention_user_id=123)

    allowed_mentions = captured['payload']['allowed_mentions']
    assert allowed_mentions == {'parse': [], 'users': ['123']}


@pytest.mark.asyncio
async def test_post_message_never_allows_everyone_or_roles():
    service = DiscordService(webhook_url='https://discord.test/webhook')
    captured = {}

    def fake_post(payload):
        captured['payload'] = payload
        return True, None

    with patch.object(service, '_post_message', side_effect=fake_post):
        await service.post_report_message('hello', mention_user_id=999)

    allowed_mentions = captured['payload']['allowed_mentions']
    assert allowed_mentions['parse'] == []
    assert 'everyone' not in allowed_mentions
    assert 'roles' not in allowed_mentions
    assert allowed_mentions['users'] == ['999']


# --- Report header (T042) ---

_METRICS = ReportMetricsDTO(
    applications_count=1,
    callback_rate=0,
    initial_screenings_count=0,
    interviews_completed_fortnight=0,
    active_processes_count=0,
    offers_count=0,
    offer_rate=0,
    total_applications_count=1,
    overall_conversion_rate=0,
    total_initial_screenings_count=0,
)

_PAYLOAD = SubmitReportPayloadDTO(
    mock_interviews_count=1,
    linkedin_posts_count=1,
    strategic_connections_count=1,
    biggest_win='win',
    biggest_challenge='challenge',
    next_fortnight_goal='goal',
)


def test_report_header_unlinked_is_byte_identical_to_today():
    message = SubmitReportUseCase._build_discord_message(
        report_day=1,
        username='ada',
        phase=1,
        metrics=_METRICS,
        payload=_PAYLOAD,
    )
    assert message.startswith(
        '🏁 **REPORT - DAY 1 OF 120** - @ada\n📅 Phase: 1\n\n'
    )


def test_report_header_linked_carries_mention():
    message = SubmitReportUseCase._build_discord_message(
        report_day=1,
        username='ada',
        phase=1,
        metrics=_METRICS,
        payload=_PAYLOAD,
        discord_id=42,
    )
    assert message.startswith(
        '🏁 **REPORT - DAY 1 OF 120** - @ada <@42>\n📅 Phase: 1\n\n'
    )


# --- Feedback header (T043) ---


def test_feedback_header_unlinked_is_byte_identical_to_today():
    message = SubmitFeedbackUseCase._build_discord_message(
        username='ada',
        score=5,
        text=None,
    )
    assert message == (
        '\U0001f4ac **USER FEEDBACK** - @ada\n⭐⭐⭐⭐⭐ (5/5)\n'
    )


def test_feedback_header_linked_carries_mention():
    message = SubmitFeedbackUseCase._build_discord_message(
        username='ada',
        score=5,
        text=None,
        discord_id=42,
    )
    assert message == (
        '\U0001f4ac **USER FEEDBACK** - @ada <@42>\n⭐⭐⭐⭐⭐ (5/5)\n'
    )
