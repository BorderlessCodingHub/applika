"""Shared date validation helpers used by use cases.

These helpers centralize the rules for "future date" detection so the
same logic can be reused across application and application step
use cases. Since the backend operates in UTC and we do not know the
caller's local timezone, the allowed upper bound is ``UTC today + 1
day`` — enough to absorb any positive timezone offset.
"""

from datetime import UTC, date, datetime, timedelta

from app.core.exceptions import InvalidDate


def utc_today() -> date:
    """The server's current UTC calendar day - the one clock every rule
    here reads."""
    return datetime.now(UTC).date()


def _max_allowed_today() -> date:
    """Return the latest date a user is allowed to pick as "today".

    Always UTC current date + 1 day, so users in timezones ahead of
    UTC are not rejected for picking their local "today".
    """
    return utc_today() + timedelta(days=1)


def _min_allowed_today() -> date:
    """Return the earliest date a user's local "today" can be.

    UTC current date - 1 day: the furthest-behind real timezone (UTC-12)
    is never more than one calendar day behind UTC (KODI-050).
    """
    return utc_today() - timedelta(days=1)


def ensure_not_in_future(value: date, field_name: str) -> date:
    """Raise ``InvalidDate`` if ``value`` is past the allowed upper bound."""
    if value is None:
        return value
    limit = _max_allowed_today()
    if value > limit:
        raise InvalidDate(
            f'{field_name} cannot be in the future (max allowed: {limit.isoformat()})'
        )
    return value


def ensure_not_before_yesterday(value: date, field_name: str) -> date:
    """Raise ``InvalidDate`` if ``value`` is before the allowed lower
    bound (UTC today - 1 day), i.e. no timezone's "today" (KODI-050)."""
    limit = _min_allowed_today()
    if value < limit:
        raise InvalidDate(
            f'{field_name} cannot be more than one day in the past '
            f'(min allowed: {limit.isoformat()})'
        )
    return value
