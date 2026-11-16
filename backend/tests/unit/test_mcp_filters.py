"""``list_applications``' filters: the CLI filter's cases
(cli/src/applika/commands/applications/filter.py), ported."""

from dataclasses import dataclass
from datetime import date

import pytest

from app.core.exceptions import ResourceNotFound
from app.presentation.mcp.filters import (
    ModeFilter,
    StatusFilter,
    filter_applications,
    resolve_platform_id,
)


@dataclass(frozen=True)
class App:
    id: int
    company_name: str
    role: str
    mode: str
    finalized: bool
    platform_id: int
    application_date: date


@dataclass(frozen=True)
class Platform:
    id: int
    name: str


APPS = [
    App(1, 'Acme', 'Backend Engineer', 'active', False, 10, date(2026, 1, 5)),
    App(2, 'Globex', 'Data Analyst', 'passive', True, 20, date(2026, 3, 1)),
    App(3, 'Initech', 'backend lead', 'active', True, 10, date(2026, 2, 10)),
]
PLATFORMS = [Platform(10, 'LinkedIn'), Platform(20, ' Indeed ')]


def _ids(apps):
    return [app.id for app in apps]


def test_no_filter_sorts_newest_first():
    assert _ids(filter_applications(APPS)) == [2, 3, 1]


def test_search_is_case_insensitive_on_company_or_role():
    assert _ids(filter_applications(APPS, search='BACKEND')) == [3, 1]
    assert _ids(filter_applications(APPS, search=' globex ')) == [2]
    assert _ids(filter_applications(APPS, search='nobody')) == []


def test_mode():
    assert _ids(filter_applications(APPS, mode=ModeFilter.PASSIVE)) == [2]
    assert _ids(filter_applications(APPS, mode=ModeFilter.ACTIVE)) == [3, 1]
    assert _ids(filter_applications(APPS, mode=ModeFilter.ALL)) == [2, 3, 1]


def test_status_active_is_open_and_finalized_is_closed():
    assert _ids(filter_applications(APPS, status=StatusFilter.ACTIVE)) == [1]
    assert _ids(
        filter_applications(APPS, status=StatusFilter.FINALIZED)
    ) == [2, 3]


def test_platform_by_id():
    assert _ids(filter_applications(APPS, platform_id=10)) == [3, 1]


def test_dates_are_inclusive():
    assert _ids(
        filter_applications(
            APPS, from_date=date(2026, 2, 10), to_date=date(2026, 3, 1)
        )
    ) == [2, 3]
    assert _ids(filter_applications(APPS, to_date=date(2026, 1, 5))) == [1]


def test_filters_combine():
    assert _ids(
        filter_applications(
            APPS,
            search='backend',
            mode=ModeFilter.ACTIVE,
            status=StatusFilter.FINALIZED,
            platform_id=10,
        )
    ) == [3]


@pytest.mark.parametrize(
    ('given', 'expected'),
    [('linkedin', 10), (' LinkedIn ', 10), ('indeed', 20), ('20', 20)],
)
def test_resolve_platform_by_name_or_id(given, expected):
    assert resolve_platform_id(PLATFORMS, given) == expected


def test_an_unknown_platform_is_the_catalog_404():
    with pytest.raises(ResourceNotFound) as caught:
        resolve_platform_id(PLATFORMS, 'Monster')
    assert caught.value.body() == {
        'detail': 'Platform not found',
        'code': 'CAT-1002',
    }
