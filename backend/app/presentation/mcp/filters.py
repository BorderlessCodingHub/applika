"""``list_applications``' filters: a port of applika-cli's
``commands/applications/filter.py``, so the tool filters exactly as
``applika applications list`` did once the CLI is gone (ADR-0028).

Search is case-insensitive in the company name or the role; ``mode`` and
``status`` default to ``all``; the platform is named (case-insensitive) or
given by id; both dates are inclusive. The result is sorted by application
date, newest first. An unknown platform is the catalog's 404
(``CAT-1002``), the CLI's "Unknown platform" turned into the API's code.
"""

from collections.abc import Sequence
from datetime import date
from enum import StrEnum
from typing import Protocol, TypeVar

from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound

PLATFORM_NOT_FOUND = 'Platform not found'


class ModeFilter(StrEnum):
    ACTIVE = 'active'
    PASSIVE = 'passive'
    ALL = 'all'


class StatusFilter(StrEnum):
    # Open (not closed).
    ACTIVE = 'active'
    # Closed.
    FINALIZED = 'finalized'
    ALL = 'all'


class _Platform(Protocol):
    @property
    def id(self) -> int: ...

    @property
    def name(self) -> str: ...


class _Application(Protocol):
    @property
    def company_name(self) -> str: ...

    @property
    def role(self) -> str: ...

    @property
    def mode(self) -> str: ...

    @property
    def finalized(self) -> bool: ...

    @property
    def platform_id(self) -> int: ...

    @property
    def application_date(self) -> date: ...


AppT = TypeVar('AppT', bound=_Application)


def resolve_platform_id(platforms: Sequence[_Platform], platform: str) -> int:
    """A platform by name (trimmed, case-insensitive) or by id, among the
    ones the caller sees."""
    wanted = platform.strip().lower()
    for candidate in platforms:
        if candidate.name.strip().lower() == wanted:
            return candidate.id
    if wanted.isdigit():
        for candidate in platforms:
            if candidate.id == int(wanted):
                return candidate.id
    raise ResourceNotFound(PLATFORM_NOT_FOUND, ErrorCode.CAT_PLATFORM_NOT_FOUND)


def filter_applications(
    applications: Sequence[AppT],
    *,
    search: str | None = None,
    mode: ModeFilter = ModeFilter.ALL,
    status: StatusFilter = StatusFilter.ALL,
    platform_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[AppT]:
    term = (search or '').strip().lower()

    def matches(app: AppT) -> bool:
        if term and (
            term not in (app.company_name or '').lower()
            and term not in (app.role or '').lower()
        ):
            return False
        if mode is not ModeFilter.ALL and app.mode != mode.value:
            return False
        if status is StatusFilter.ACTIVE and app.finalized:
            return False
        if status is StatusFilter.FINALIZED and not app.finalized:
            return False
        if platform_id is not None and app.platform_id != platform_id:
            return False
        if from_date is not None and app.application_date < from_date:
            return False
        return to_date is None or app.application_date <= to_date

    return sorted(
        (app for app in applications if matches(app)),
        key=lambda app: app.application_date,
        reverse=True,
    )
