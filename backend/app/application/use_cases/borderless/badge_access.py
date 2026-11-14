"""The one rule for whether a recorded badge counts (ADR-0026 §7).

Used by the report gate, report routing and ``/users/me``. A badge is held
while its row is live and the user's Borderless binding is ``active``:
there is no expiry. ``needs_reconnect`` (Borderless refused the grant)
never revokes a row; the next sign-in makes it count again.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.core.enums import BorderlessAccountStatus
from app.domain.models import BorderlessAccountModel, UserBadgeModel

AccessStatus = Literal['active', 'needs_reconnect']


@dataclass(frozen=True)
class BadgeAccess:
    status: AccessStatus | None
    badges: list[str]
    held: bool

    @property
    def held_badges(self) -> list[str]:
        return list(self.badges) if self.held else []


def access_status(
    binding: BorderlessAccountModel | None,
) -> AccessStatus | None:
    if binding is None:
        return None
    if binding.status == BorderlessAccountStatus.NEEDS_RECONNECT.value:
        return 'needs_reconnect'
    return 'active'


def badge_access(
    binding: BorderlessAccountModel | None,
    live_badges: Sequence[UserBadgeModel],
) -> BadgeAccess:
    status = access_status(binding)
    badges = [row.badge for row in live_badges if row.revoked_at is None]
    return BadgeAccess(
        status=status,
        badges=badges,
        held=bool(badges) and status == 'active',
    )
