"""The one rule for whether a badge counts (ADR-0024): a live row while the
binding is ``active`` and the Borderless access has not expired."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import pytest

from app.application.use_cases.borderless.badge_access import (
    access_status,
    badge_access,
)

NOW = datetime(2026, 10, 29, 12, tzinfo=UTC)


def _binding(status='active', expires=timedelta(days=1)) -> Any:
    return SimpleNamespace(status=status, access_token_expires_at=NOW + expires)


def _row(badge='borderless_psp', revoked_at=None) -> Any:
    return SimpleNamespace(badge=badge, revoked_at=revoked_at)


def test_live_row_active_unexpired_is_held():
    access = badge_access(_binding(), [_row()], NOW)
    assert access.status == 'active'
    assert access.held is True
    assert access.badges == ['borderless_psp']
    assert access.held_badges == ['borderless_psp']


def test_expired_access_keeps_the_row_but_does_not_hold_it():
    access = badge_access(_binding(expires=timedelta(0)), [_row()], NOW)
    assert access.status == 'expired'
    assert access.held is False
    assert access.badges == ['borderless_psp']
    assert access.held_badges == []


def test_needs_reconnect_keeps_the_row_but_does_not_hold_it():
    access = badge_access(_binding('needs_reconnect'), [_row()], NOW)
    assert access.status == 'needs_reconnect'
    assert access.held is False
    assert access.badges == ['borderless_psp']


def test_no_binding_holds_nothing():
    access = badge_access(None, [_row()], NOW)
    assert access.status is None
    assert access.held is False


def test_no_live_row_holds_nothing():
    access = badge_access(_binding(), [_row(revoked_at=NOW)], NOW)
    assert access.badges == []
    assert access.held is False


@pytest.mark.parametrize(
    ('binding', 'expected'),
    [
        (None, None),
        (_binding(), 'active'),
        (_binding(expires=-timedelta(seconds=1)), 'expired'),
        (_binding('needs_reconnect', timedelta(days=1)), 'needs_reconnect'),
    ],
)
def test_access_status(binding, expected):
    assert access_status(binding, NOW) == expected


def test_access_status_defaults_to_now():
    binding = cast(
        Any,
        SimpleNamespace(
            status='active',
            access_token_expires_at=datetime.now(UTC) + timedelta(hours=1),
        ),
    )
    assert access_status(binding) == 'active'
