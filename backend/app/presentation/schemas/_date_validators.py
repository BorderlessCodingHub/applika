"""Shared date validation helpers used by Pydantic schemas.

These helpers centralize the rules for "future date" detection so the
same logic can be reused across application and application step
schemas. Since the backend operates in UTC and we do not know the
caller's local timezone, the allowed upper bound is ``UTC today + 1
day`` — enough to absorb any positive timezone offset.
"""

from datetime import date, datetime, timedelta, timezone


def max_allowed_today() -> date:
    """Return the latest date a user is allowed to pick as "today".

    Always UTC current date + 1 day, so users in timezones ahead of
    UTC are not rejected for picking their local "today".
    """
    return (datetime.now(timezone.utc) + timedelta(days=1)).date()


def ensure_not_in_future(value: date, field_name: str) -> date:
    """Raise ``ValueError`` if ``value`` is past the allowed upper bound."""
    if value is None:
        return value
    limit = max_allowed_today()
    if value > limit:
        raise ValueError(
            f'{field_name} cannot be in the future '
            f'(max allowed: {limit.isoformat()})'
        )
    return value
