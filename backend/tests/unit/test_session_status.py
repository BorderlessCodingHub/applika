"""The device list's derived status (KODI-057, R-013, R-014)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.application.use_cases.sessions.list_my_sessions import derive_status

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)
LATER = NOW + timedelta(days=3)
EARLIER = NOW - timedelta(seconds=1)


@pytest.mark.parametrize(
    ('end_reason', 'status'),
    [
        ('logout', 'signed_out'),
        ('replaced', 'signed_out'),
        ('revoked', 'revoked'),
        ('github_revoked', 'revoked'),
        ('expired', 'expired'),
    ],
)
def test_an_ended_row_shows_how_it_ended(end_reason, status):
    # Whatever Redis says: an ended row never reads as active.
    assert derive_status(end_reason, LATER, True, NOW) == status
    assert derive_status(end_reason, LATER, False, NOW) == status


def test_an_open_row_with_a_live_key_is_active():
    assert derive_status(None, LATER, True, NOW) == 'active'


def test_an_open_row_whose_key_is_gone_is_expired():
    """Redis lost the key (expired, or Redis lost its data)."""
    assert derive_status(None, LATER, False, NOW) == 'expired'


def test_an_open_row_past_expires_at_is_expired_even_with_a_key():
    assert derive_status(None, EARLIER, True, NOW) == 'expired'
    assert derive_status(None, NOW, True, NOW) == 'expired'
