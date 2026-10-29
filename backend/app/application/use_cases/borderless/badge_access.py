"""The one rule for whether a recorded badge counts (ADR-0024).

Used by the report gate, report routing and ``/users/me``. A badge is held
only while its row is live, the binding is ``active`` and the Borderless
access from the last password sign-in has not expired. Expiry and
``needs_reconnect`` never revoke a row.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.core.enums import BorderlessAccountStatus
from app.domain.models import BorderlessAccountModel, UserBadgeModel

AccessStatus = Literal['active', 'expired', 'needs_reconnect']


@dataclass(frozen=True)
class BadgeAccess:
    status: AccessStatus | None
    badges: list[str]
    held: bool

    @property
    def held_badges(self) -> list[str]:
        return list(self.badges) if self.held else []


def access_status(
    binding: BorderlessAccountModel | None, now: datetime | None = None
) -> AccessStatus | None:
    if binding is None:
        return None
    if binding.status == BorderlessAccountStatus.NEEDS_RECONNECT.value:
        return 'needs_reconnect'
    now = now or datetime.now(UTC)
    if binding.access_token_expires_at <= now:
        return 'expired'
    return 'active'


def badge_access(
    binding: BorderlessAccountModel | None,
    live_badges: Sequence[UserBadgeModel],
    now: datetime | None = None,
) -> BadgeAccess:
    status = access_status(binding, now)
    badges = [row.badge for row in live_badges if row.revoked_at is None]
    return BadgeAccess(
        status=status,
        badges=badges,
        held=bool(badges) and status == 'active',
    )
