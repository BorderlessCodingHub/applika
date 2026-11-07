"""The one rule for whether a badge counts (ADR-0026 §7): a live row while
the binding is ``active``. There is no expiry; ``needs_reconnect`` keeps
the row but does not hold it."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from app.application.use_cases.borderless.badge_access import (
    access_status,
    badge_access,
)

NOW = datetime(2026, 11, 6, 12, tzinfo=UTC)


def _binding(status='active') -> Any:
    return SimpleNamespace(status=status)


def _row(badge='borderless_psp', revoked_at=None) -> Any:
    return SimpleNamespace(badge=badge, revoked_at=revoked_at)


def test_live_row_on_an_active_binding_is_held():
    access = badge_access(_binding(), [_row()])
    assert access.status == 'active'
    assert access.held is True
    assert access.badges == ['borderless_psp']
    assert access.held_badges == ['borderless_psp']


def test_needs_reconnect_keeps_the_row_but_does_not_hold_it():
    access = badge_access(_binding('needs_reconnect'), [_row()])
    assert access.status == 'needs_reconnect'
    assert access.held is False
    assert access.badges == ['borderless_psp']
    assert access.held_badges == []


def test_no_binding_holds_nothing():
    access = badge_access(None, [_row()])
    assert access.status is None
    assert access.held is False


def test_no_live_row_holds_nothing():
    access = badge_access(_binding(), [_row(revoked_at=NOW)])
    assert access.badges == []
    assert access.held is False


@pytest.mark.parametrize(
    ('binding', 'expected'),
    [
        (None, None),
        (_binding(), 'active'),
        (_binding('needs_reconnect'), 'needs_reconnect'),
    ],
)
def test_access_status(binding, expected):
    assert access_status(binding) == expected
