"""Unit tests for ``CreateDraftFromJobUseCase`` (KODI-047, T066/T068):
the prefill and the cuts, the company rule, the refusals and their order,
the shared-session copy and the race on ``uq_applications_user_job``.
Mocked repositories, no database."""

from datetime import date
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from asyncpg.exceptions import UniqueViolationError
from sqlalchemy.exc import IntegrityError

from app.application.dto.application import ApplicationCompanyInputDTO
from app.application.use_cases.application_drafts import (
    create_draft_from_job as module,
)
from app.application.use_cases.application_drafts.create_draft_from_job import (
    ALREADY_APPLIED,
    CreateDraftFromJobUseCase,
    web_url,
)
from app.core.enums import WorkMode
from app.core.exceptions import (
    BusinessRuleViolation,
    ResourceConflict,
    ResourceNotFound,
)

USER = 1
PLATFORM = 50


def job(**overrides: Any) -> SimpleNamespace:
    values: dict[str, Any] = {
        'id': 7,
        'source_id': 3,
        'title': 'Backend Engineer',
        'company_name': 'Globex',
        'company_url': None,
        'job_url': 'https://jobs.example/7',
        'description_text': 'Python and Go.',
        'is_active': True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def draft_row(**overrides: Any) -> SimpleNamespace:
    from datetime import UTC, datetime

    values: dict[str, Any] = {
        'id': 99,
        'created_at': datetime(2026, 10, 12, tzinfo=UTC),
        'updated_at': None,
        'company_id': None,
        'company_name': 'Globex',
        'role': 'Backend Engineer',
        'mode': 'active',
        'platform_id': PLATFORM,
        'link_to_job': 'https://jobs.example/7',
        'observation': None,
        'expected_salary': None,
        'salary_range_min': None,
        'salary_range_max': None,
        'currency': None,
        'salary_period': None,
        'experience_level': None,
        'work_mode': WorkMode.REMOTE,
        'country': None,
        'job_description': 'Python and Go.',
        'application_date': date.today(),
        'job_id': 7,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class Deps:
    def __init__(self, found_job: Any = None) -> None:
        self.job_repo = AsyncMock()
        self.job_repo.get_by_id.return_value = (
            found_job if found_job is not None else job()
        )
        self.source_repo = AsyncMock()
        self.source_repo.get.return_value = SimpleNamespace(
            id=3, platform_id=PLATFORM
        )
        self.app_repo = AsyncMock()
        self.app_repo.get_by_job_id.return_value = None
        self.app_repo.create_draft.return_value = draft_row()
        self.platform_repo = AsyncMock()
        self.platform_repo.get_visible.return_value = SimpleNamespace(
            id=PLATFORM
        )
        self.company_repo = AsyncMock()
        self.base_cv_repo = AsyncMock()
        self.base_cv_repo.get_by_id_and_user_id.return_value = SimpleNamespace(
            id=11
        )
        self.create_copy = AsyncMock()

    def use_case(self) -> CreateDraftFromJobUseCase:
        return CreateDraftFromJobUseCase(
            self.job_repo,
            self.source_repo,
            self.app_repo,
            self.platform_repo,
            self.company_repo,
            self.base_cv_repo,
            self.create_copy,
        )

    def nothing_written(self) -> None:
        self.app_repo.create_draft.assert_not_awaited()
        self.company_repo.create.assert_not_awaited()
        self.create_copy.execute.assert_not_awaited()


def draft_input(deps: Deps):
    return deps.app_repo.create_draft.await_args.args[0]


# ---------------------------------------------------------------------------
# AC7: the prefill and the cuts
# ---------------------------------------------------------------------------


async def test_prefill_from_the_job():
    deps = Deps()

    result = await deps.use_case().execute(7, USER)

    data = draft_input(deps)
    assert data.user_id == USER
    assert data.role == 'Backend Engineer'
    assert data.company_name == 'Globex'
    assert data.company_id is None
    assert data.platform_id == PLATFORM
    assert str(data.link_to_job) == 'https://jobs.example/7'
    assert data.job_description == 'Python and Go.'
    assert data.work_mode is WorkMode.REMOTE
    assert data.mode == 'active'
    assert data.application_date == date.today()
    assert data.country is None
    kwargs = deps.app_repo.create_draft.await_args.kwargs
    assert kwargs == {
        'company_id': None,
        'company_name': 'Globex',
        'job_id': 7,
        'commit': True,
    }
    deps.platform_repo.get_visible.assert_awaited_once_with(PLATFORM, USER)
    assert result.job_id == 7
    assert result.has_cv is False


async def test_values_are_cut_to_the_application_limits():
    deps = Deps(
        job(
            title=' ' + 'T' * 450,
            company_name='C' * 280,
            description_text='D' * 60000,
        )
    )

    await deps.use_case().execute(7, USER)

    data = draft_input(deps)
    assert data.role == 'T' * 200
    assert data.company_name == 'C' * 200
    assert data.job_description == 'D' * 50000


@pytest.mark.parametrize(
    'url',
    [
        None,
        '',
        '   ',
        'not a url',
        'ftp://files.example/x',
        'https://e.example/' + 'a' * 2083,
    ],
)
async def test_an_unusable_posting_link_is_left_empty(url: str | None):
    deps = Deps(job(job_url=url))

    await deps.use_case().execute(7, USER)

    assert draft_input(deps).link_to_job is None


def test_web_url_accepts_http_and_https_only():
    assert str(web_url('http://a.example')) == 'http://a.example/'
    assert str(web_url(' https://a.example/x ')) == 'https://a.example/x'
    assert web_url('mailto:a@example.com') is None
    assert web_url(None) is None


async def test_blank_description_is_stored_as_none():
    deps = Deps(job(description_text=''))

    await deps.use_case().execute(7, USER)

    assert draft_input(deps).job_description is None


# ---------------------------------------------------------------------------
# AC8: the company
# ---------------------------------------------------------------------------


async def test_a_valid_company_website_goes_through_resolve_company():
    deps = Deps(job(company_url='https://globex.example/about'))
    with patch.object(
        module, 'resolve_company', AsyncMock(return_value=(321, 'Globex Inc'))
    ) as resolve:
        await deps.use_case().execute(7, USER)

    resolve.assert_awaited_once()
    awaited = resolve.await_args
    assert awaited is not None
    repo, company, user_id = awaited.args
    assert repo is deps.company_repo
    assert isinstance(company, ApplicationCompanyInputDTO)
    assert company.name == 'Globex'
    assert str(company.url) == 'https://globex.example/about'
    assert user_id == USER
    kwargs = deps.app_repo.create_draft.await_args.kwargs
    assert (kwargs['company_id'], kwargs['company_name']) == (321, 'Globex Inc')
    assert draft_input(deps).company_id == 321


@pytest.mark.parametrize('url', [None, '', 'not a url', 'ftp://globex.example'])
async def test_no_valid_website_keeps_the_company_free_text(url):
    deps = Deps(job(company_url=url))
    with patch.object(module, 'resolve_company', AsyncMock()) as resolve:
        await deps.use_case().execute(7, USER)

    resolve.assert_not_awaited()
    kwargs = deps.app_repo.create_draft.await_args.kwargs
    assert (kwargs['company_id'], kwargs['company_name']) == (None, 'Globex')


# ---------------------------------------------------------------------------
# Refusals, before any write
# ---------------------------------------------------------------------------


async def test_unknown_job_is_404():
    deps = Deps()
    deps.job_repo.get_by_id.return_value = None

    with pytest.raises(ResourceNotFound, match='Job not found'):
        await deps.use_case().execute(7, USER)
    deps.nothing_written()


async def test_inactive_job_is_404():
    deps = Deps(job(is_active=False))

    with pytest.raises(ResourceNotFound, match='Job not found'):
        await deps.use_case().execute(7, USER)
    deps.nothing_written()


@pytest.mark.parametrize('title', ['', '   '])
async def test_a_job_without_title_is_422(title):
    deps = Deps(job(title=title, company_url='https://globex.example'))
    with patch.object(module, 'resolve_company', AsyncMock()) as resolve:
        with pytest.raises(BusinessRuleViolation) as raised:
            await deps.use_case().execute(7, USER, base_cv_id=11)

    assert str(raised.value) == 'This job has no title to start from'
    resolve.assert_not_awaited()
    deps.nothing_written()


@pytest.mark.parametrize('url', [None, 'https://globex.example'])
@pytest.mark.parametrize('name', ['', '   '])
async def test_a_job_without_company_name_starts_as_unknown_company(name, url):
    """Human ruling: a blank company is the free text ``Unknown company``;
    ``resolve_company`` is never called, even with a valid website."""
    deps = Deps(job(company_name=name, company_url=url))
    with patch.object(module, 'resolve_company', AsyncMock()) as resolve:
        await deps.use_case().execute(7, USER)

    resolve.assert_not_awaited()
    kwargs = deps.app_repo.create_draft.await_args.kwargs
    assert (kwargs['company_id'], kwargs['company_name']) == (
        None,
        'Unknown company',
    )
    data = draft_input(deps)
    assert (data.company_id, data.company_name) == (None, 'Unknown company')


async def test_existing_application_is_409():
    deps = Deps()
    deps.app_repo.get_by_job_id.return_value = SimpleNamespace(id=5)

    with pytest.raises(ResourceConflict) as raised:
        await deps.use_case().execute(7, USER)

    assert str(raised.value) == ALREADY_APPLIED
    deps.app_repo.get_by_job_id.assert_awaited_once_with(USER, 7)
    deps.nothing_written()


async def test_a_source_without_platform_is_404():
    deps = Deps()
    deps.source_repo.get.return_value = SimpleNamespace(id=3, platform_id=None)

    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await deps.use_case().execute(7, USER)
    deps.nothing_written()


async def test_an_invisible_platform_is_404():
    deps = Deps()
    deps.platform_repo.get_visible.return_value = None

    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await deps.use_case().execute(7, USER)
    deps.nothing_written()


async def test_another_users_master_cv_is_404_and_nothing_is_written():
    deps = Deps(job(company_url='https://globex.example'))
    deps.base_cv_repo.get_by_id_and_user_id.return_value = None
    with patch.object(module, 'resolve_company', AsyncMock()) as resolve:
        with pytest.raises(ResourceNotFound, match='Base CV not found'):
            await deps.use_case().execute(7, USER, base_cv_id=11)

    deps.base_cv_repo.get_by_id_and_user_id.assert_awaited_once_with(11, USER)
    resolve.assert_not_awaited()
    deps.nothing_written()


async def test_keywords_without_a_description_is_422_before_any_write():
    deps = Deps(job(description_text='  '))

    with pytest.raises(BusinessRuleViolation, match='job description'):
        await deps.use_case().execute(
            7, USER, base_cv_id=11, tailoring='keywords'
        )
    deps.nothing_written()


# ---------------------------------------------------------------------------
# AC9/AC12: the copy on the same session
# ---------------------------------------------------------------------------


async def test_with_a_master_cv_the_draft_is_flushed_and_the_copy_commits():
    deps = Deps()

    result = await deps.use_case().execute(7, USER, base_cv_id=11)

    assert deps.app_repo.create_draft.await_args.kwargs['commit'] is False
    copy = deps.create_copy.execute.await_args.args[0]
    assert (copy.user_id, copy.application_id, copy.base_cv_id) == (
        USER,
        99,
        11,
    )
    assert copy.tailoring == 'copy'
    assert result.has_cv is True


async def test_keywords_is_passed_through_to_the_copy():
    deps = Deps()

    await deps.use_case().execute(7, USER, base_cv_id=11, tailoring='keywords')

    assert deps.create_copy.execute.await_args.args[0].tailoring == 'keywords'


async def test_a_failed_copy_rolls_the_draft_back():
    deps = Deps()
    deps.create_copy.execute.side_effect = RuntimeError('boom')

    with pytest.raises(RuntimeError, match='boom'):
        await deps.use_case().execute(7, USER, base_cv_id=11)

    deps.app_repo.rollback.assert_awaited_once()


# ---------------------------------------------------------------------------
# AC10: the race on uq_applications_user_job
# ---------------------------------------------------------------------------


def integrity_error(constraint: str) -> IntegrityError:
    orig = UniqueViolationError(
        f'duplicate key value violates unique constraint "{constraint}"'
    )
    return IntegrityError('INSERT', {}, orig)


async def test_losing_the_race_is_the_same_409():
    deps = Deps()
    deps.app_repo.create_draft.side_effect = integrity_error(
        'uq_applications_user_job'
    )

    with pytest.raises(ResourceConflict) as raised:
        await deps.use_case().execute(7, USER)

    assert str(raised.value) == ALREADY_APPLIED


async def test_another_integrity_error_is_not_disguised():
    deps = Deps()
    deps.app_repo.create_draft.side_effect = integrity_error('some_other_key')

    with pytest.raises(IntegrityError):
        await deps.use_case().execute(7, USER)
