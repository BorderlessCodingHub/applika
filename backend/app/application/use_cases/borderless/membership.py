"""The membership claim becomes the badge (ADR-0026 §7).

``borderless_membership`` ``BASE`` and ``PSP``, compared ignoring case,
give the BASE and PSP badges. ``FREE``, ``STARTER``, any other value or no
value gives none, which revokes the live badge (history is kept).
"""

from app.core.enums import BadgeKey

_BADGES = {
    'base': BadgeKey.BORDERLESS_BASE,
    'psp': BadgeKey.BORDERLESS_PSP,
}


def badge_for(value: object) -> BadgeKey | None:
    if not isinstance(value, str):
        return None
    return _BADGES.get(value.strip().lower())
