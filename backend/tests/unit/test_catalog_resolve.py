from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.application.dto.application import ApplicationCompanyInputDTO
from app.application.use_cases.catalog.resolve import (
    ensure_platform_visible,
    resolve_company,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict, ResourceNotFound


def _company_input(**overrides) -> ApplicationCompanyInputDTO:
    defaults: dict[str, Any] = dict(name='Acme', url='https://acme.example.com')
    defaults.update(overrides)
    return ApplicationCompanyInputDTO(**defaults)


# ---------------------------------------------------------------------------
# ensure_platform_visible
# ---------------------------------------------------------------------------


async def test_ensure_platform_visible_returns_the_platform():
    platform_repo = AsyncMock()
    platform_repo.get_visible.return_value = SimpleNamespace(id=1)

    result = await ensure_platform_visible(platform_repo, 1, user_id=7)

    assert result.id == 1
    platform_repo.get_visible.assert_awaited_once_with(1, 7)


async def test_ensure_platform_visible_invisible_id_is_404():
    platform_repo = AsyncMock()
    platform_repo.get_visible.return_value = None

    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await ensure_platform_visible(platform_repo, 999, user_id=7)


# ---------------------------------------------------------------------------
# resolve_company
# ---------------------------------------------------------------------------


async def test_resolve_company_by_id_reuses_public():
    company_repo = AsyncMock()
    company_repo.get_visible.return_value = SimpleNamespace(id=1, name='Acme')

    result = await resolve_company(company_repo, 1, user_id=7)

    assert result == (1, 'Acme')


async def test_resolve_company_invisible_id_is_404():
    company_repo = AsyncMock()
    company_repo.get_visible.return_value = None

    with pytest.raises(ResourceNotFound, match='Company not found'):
        await resolve_company(company_repo, 999, user_id=7)


async def test_resolve_company_free_text_when_url_is_none():
    company_repo = AsyncMock()

    result = await resolve_company(
        company_repo, _company_input(url=None), user_id=7
    )

    assert result == (None, 'Acme')
    company_repo.find_visible_match.assert_not_called()
    company_repo.create.assert_not_called()


async def test_resolve_company_reuses_own_private_match():
    company_repo = AsyncMock()
    company_repo.find_visible_match.return_value = SimpleNamespace(
        id=5, name='Acme'
    )

    result = await resolve_company(company_repo, _company_input(), user_id=7)

    assert result == (5, 'Acme')
    company_repo.create.assert_not_called()


async def test_resolve_company_creates_a_new_private_row_when_no_match():
    company_repo = AsyncMock()
    company_repo.find_visible_match.return_value = None
    company_repo.create.return_value = SimpleNamespace(id=8, name='Acme')

    result = await resolve_company(company_repo, _company_input(), user_id=7)

    assert result == (8, 'Acme')
    _, kwargs = company_repo.create.call_args
    assert kwargs == {'is_public': False}


async def test_resolve_company_admin_gets_a_private_row_too():
    """Owner decision, 2026-09-25: no admin branch in company resolution."""
    company_repo = AsyncMock()
    company_repo.find_visible_match.return_value = None
    company_repo.create.return_value = SimpleNamespace(id=9, name='Acme')

    await resolve_company(company_repo, _company_input(), user_id=1)

    args, kwargs = company_repo.create.call_args
    assert args[0].created_by == 1
    assert kwargs == {'is_public': False}


async def test_resolve_company_race_re_reads_instead_of_failing():
    """Two requests create the same visible company at once; the loser's
    insert hits the unique index and is read back instead of raising."""
    company_repo = AsyncMock()
    company_repo.find_visible_match.side_effect = [
        None,
        SimpleNamespace(id=8, name='Acme'),
    ]
    company_repo.create.side_effect = ResourceConflict(
        'duplicate', ErrorCode.CAT_COMPANY_EXISTS
    )

    result = await resolve_company(company_repo, _company_input(), user_id=7)

    assert result == (8, 'Acme')


async def test_resolve_company_race_reraises_when_still_not_found():
    company_repo = AsyncMock()
    company_repo.find_visible_match.side_effect = [None, None]
    company_repo.create.side_effect = ResourceConflict(
        'duplicate', ErrorCode.CAT_COMPANY_EXISTS
    )

    with pytest.raises(ResourceConflict):
        await resolve_company(company_repo, _company_input(), user_id=7)


async def test_resolve_company_normalizes_the_url_before_matching():
    company_repo = AsyncMock()
    company_repo.find_visible_match.return_value = SimpleNamespace(
        id=2, name='Acme'
    )

    await resolve_company(
        company_repo,
        _company_input(url='https://www.linkedin.com/company/acme/jobs?x=1'),
        user_id=7,
    )

    args, _ = company_repo.find_visible_match.call_args
    assert args[1] == 'https://www.linkedin.com/company/acme'
