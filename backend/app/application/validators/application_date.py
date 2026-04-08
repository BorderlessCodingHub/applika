"""Shared date validation helpers used by use cases.

These helpers centralize the rules for "future date" detection so the
same logic can be reused across application and application step
use cases. Since the backend operates in UTC and we do not know the
caller's local timezone, the allowed upper bound is ``UTC today + 1
day`` — enough to absorb any positive timezone offset.
"""

from datetime import date, datetime, timedelta, timezone

from app.core.exceptions import InvalidDate


def _max_allowed_today() -> date:
    """Return the latest date a user is allowed to pick as "today".

    Always UTC current date + 1 day, so users in timezones ahead of
    UTC are not rejected for picking their local "today".
    """
    return (datetime.now(timezone.utc) + timedelta(days=1)).date()


def ensure_not_in_future(value: date, field_name: str) -> date:
    """Raise ``InvalidDate`` if ``value`` is past the allowed upper bound."""
    if value is None:
        return value
    limit = _max_allowed_today()
    if value > limit:
        raise InvalidDate(
            f'{field_name} cannot be in the future '
            f'(max allowed: {limit.isoformat()})'
        )
    return value
