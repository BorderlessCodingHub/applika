"""Report routing by badge (ADR-0024): a report reaches every webhook
holding a badge its author holds, distinct, oldest first; nothing when no
badge is held or a webhook has no badge. A webhook may hold both badges."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.application.use_cases.quinzenal_reports.resolve_report_webhooks import (
    ResolveReportWebhooksUseCase,
)


def _binding(status='active', expires=timedelta(days=1)) -> Any:
    return SimpleNamespace(
        status=status, access_token_expires_at=datetime.now(UTC) + expires
    )


def _badge(badge):
    return SimpleNamespace(badge=badge, revoked_at=None)


def _hook(url, badges, age):
    return SimpleNamespace(
        url=url, badges=badges, created_at=datetime(2026, 1, 1) + age
    )


class Repos:
    def __init__(self, binding, badges, hooks):
        self.binding = binding
        self.badges = badges
        self.hooks = hooks
        self.asked: list[list[str]] = []

    async def get_by_user_id(self, user_id):
        return self.binding

    async def live_for_user(self, user_id):
        return self.badges

    async def list_by_badges(self, badges):
        self.asked.append(list(badges))
        return sorted(
            (h for h in self.hooks if set(h.badges) & set(badges)),
            key=lambda h: h.created_at,
        )


def _use_case(repos: Repos) -> ResolveReportWebhooksUseCase:
    fake = cast(Any, repos)
    return ResolveReportWebhooksUseCase(fake, fake, fake)


HOOKS = [
    _hook('https://hook/psp-2', ['borderless_psp'], timedelta(days=2)),
    _hook('https://hook/base', ['borderless_base'], timedelta(days=1)),
    _hook('https://hook/psp-1', ['borderless_psp'], timedelta(days=0)),
    _hook('https://hook/unassigned', [], timedelta(days=0)),
]
BOTH = [
    _hook(
        'https://hook/both', ['borderless_base', 'borderless_psp'], timedelta(0)
    ),
    _hook('https://hook/psp', ['borderless_psp'], timedelta(days=1)),
]


@pytest.mark.asyncio
async def test_psp_member_reaches_psp_hooks_only_oldest_first():
    repos = Repos(_binding(), [_badge('borderless_psp')], HOOKS)
    urls = await _use_case(repos).execute(1)
    assert urls == ['https://hook/psp-1', 'https://hook/psp-2']
    assert repos.asked == [['borderless_psp']]


@pytest.mark.asyncio
async def test_base_member_reaches_base_hooks_only():
    repos = Repos(_binding(), [_badge('borderless_base')], HOOKS)
    assert await _use_case(repos).execute(1) == ['https://hook/base']


@pytest.mark.asyncio
async def test_duplicate_urls_are_posted_once():
    hooks = [
        _hook('https://hook/x', ['borderless_psp'], timedelta(0)),
        _hook('https://hook/x', ['borderless_psp'], timedelta(1)),
    ]
    repos = Repos(_binding(), [_badge('borderless_psp')], hooks)
    assert await _use_case(repos).execute(1) == ['https://hook/x']


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('held', 'expected'),
    [
        (['borderless_base'], ['https://hook/both']),
        (['borderless_psp'], ['https://hook/both', 'https://hook/psp']),
        (
            ['borderless_base', 'borderless_psp'],
            ['https://hook/both', 'https://hook/psp'],
        ),
    ],
    ids=['base', 'psp', 'both'],
)
async def test_a_webhook_holding_both_badges_is_reached_by_either(
    held, expected
):
    repos = Repos(_binding(), [_badge(b) for b in held], BOTH)
    assert await _use_case(repos).execute(1) == expected


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('binding', 'badges'),
    [
        (None, []),
        (_binding(), []),
        (_binding(expires=timedelta(seconds=-1)), [_badge('borderless_psp')]),
        (_binding(status='needs_reconnect'), [_badge('borderless_psp')]),
        (None, [_badge('borderless_psp')]),
    ],
    ids=['unbound', 'no-badge', 'expired', 'needs-reconnect', 'no-binding'],
)
async def test_nothing_is_posted_without_a_held_badge(binding, badges):
    repos = Repos(binding, badges, HOOKS)
    assert await _use_case(repos).execute(1) == []
    assert repos.asked == []
