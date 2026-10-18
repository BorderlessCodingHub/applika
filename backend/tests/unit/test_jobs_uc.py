"""Unit tests for the job board read and dismissal use cases (KODI-047,
T063/T064/T070) and the ``JobFilters`` wire schema. Mocked repositories, no
database; the SQL itself is covered by ``tests/integration/test_jobs_api.py``.
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.application.dto.job import JobFiltersDTO
from app.application.use_cases.jobs.dismiss_job import DismissJobUseCase
from app.application.use_cases.jobs.get_job import GetJobUseCase
from app.application.use_cases.jobs.list_jobs import ListJobsUseCase
from app.application.use_cases.jobs.restore_job import RestoreJobUseCase
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.job_repository import JobUserRow
from app.presentation.schemas.jobs import JobFilters, JobListQuery
from tests.unit.jobs_fakes import base_cv

POSTED = datetime(2026, 10, 1, tzinfo=UTC)


def job(**overrides: Any) -> SimpleNamespace:
    values: dict[str, Any] = {
        'id': 7,
        'title': 'Backend Engineer',
        'company_name': 'Globex',
        'company_url': 'https://globex.example',
        'location_text': 'Remote',
        'employment_type': None,
        'salary_text': None,
        'tags': ['python'],
        'posted_at': POSTED,
        'job_url': 'https://jobs.example/7',
        'is_active': True,
        'description_text': 'Python and Go.',
        'keywords': ['python', 'go'],
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def row(**overrides: Any) -> JobUserRow:
    values: dict[str, Any] = {
        'job': job(),
        'source_code': 'himalayas',
        'source_name': 'Himalayas',
        'best_fit_score': None,
        'best_fit_base_cv_id': None,
        'dismissed': False,
        'application_id': None,
        'application_is_draft': None,
    }
    values.update(overrides)
    return JobUserRow(**values)


# ---------------------------------------------------------------------------
# ListJobsUseCase
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ('total', 'per_page', 'pages'),
    [(0, 25, 0), (1, 25, 1), (25, 25, 1), (26, 25, 2), (101, 100, 2)],
)
async def test_list_counts_pages(total: int, per_page: int, pages: int):
    repo = AsyncMock()
    repo.list_for_user.return_value = ([], total)

    page = await ListJobsUseCase(repo).execute(
        1, JobFiltersDTO(), page=1, per_page=per_page, with_fit=True
    )

    assert page.total_pages == pages
    assert page.total == total
    assert page.per_page == per_page


async def test_list_passes_the_caller_and_filters_through():
    repo = AsyncMock()
    repo.list_for_user.return_value = ([], 0)
    filters = JobFiltersDTO(search='go', tags=['a'], sort='fit')

    await ListJobsUseCase(repo).execute(
        42, filters, page=3, per_page=10, with_fit=True
    )

    repo.list_for_user.assert_awaited_once_with(42, filters, 3, 10)


async def test_list_maps_fit_application_and_dismissal():
    repo = AsyncMock()
    repo.list_for_user.return_value = (
        [
            row(
                best_fit_score=80,
                best_fit_base_cv_id=3,
                dismissed=True,
                application_id=9,
                application_is_draft=True,
            ),
            row(application_id=10, application_is_draft=False),
            row(),
        ],
        3,
    )

    items = (
        await ListJobsUseCase(repo).execute(
            1, JobFiltersDTO(), 1, 25, with_fit=True
        )
    ).items

    assert items[0].best_fit is not None
    assert (items[0].best_fit.base_cv_id, items[0].best_fit.score) == (3, 80)
    assert items[0].dismissed is True
    assert items[0].application is not None
    assert (items[0].application.id, items[0].application.is_draft) == (9, True)
    assert items[1].application is not None
    assert items[1].application.is_draft is False
    assert items[2].best_fit is None
    assert items[2].application is None
    assert items[2].source.code == 'himalayas'
    assert items[2].source.name == 'Himalayas'


async def test_list_without_cvs_has_no_fit_on_any_item():
    """ADR-0021: without "cvs" a stored best fit is never sent."""
    repo = AsyncMock()
    repo.list_for_user.return_value = (
        [
            row(
                best_fit_score=80,
                best_fit_base_cv_id=3,
                application_id=9,
                application_is_draft=True,
            ),
            row(best_fit_score=10, best_fit_base_cv_id=4),
        ],
        2,
    )

    page = await ListJobsUseCase(repo).execute(
        1, JobFiltersDTO(), 1, 25, with_fit=False
    )

    assert [item.best_fit for item in page.items] == [None, None]
    assert page.total == 2
    # The application mark is not part of the fit: unchanged.
    assert page.items[0].application is not None
    assert page.items[0].application.id == 9


@pytest.mark.parametrize('min_fit', [0, 1, 100])
async def test_list_without_cvs_a_minimum_fit_matches_no_job(min_fit: int):
    repo = AsyncMock()
    repo.list_for_user.return_value = ([row()], 1)

    page = await ListJobsUseCase(repo).execute(
        1, JobFiltersDTO(min_fit=min_fit), 2, 10, with_fit=False
    )

    assert page.items == []
    assert (page.total, page.total_pages) == (0, 0)
    assert (page.page, page.per_page) == (2, 10)
    repo.list_for_user.assert_not_awaited()


async def test_list_without_cvs_sorts_by_fit_as_newest():
    repo = AsyncMock()
    repo.list_for_user.return_value = ([], 0)
    filters = JobFiltersDTO(search='go', tags=['a'], sort='fit')

    await ListJobsUseCase(repo).execute(
        42, filters, page=3, per_page=10, with_fit=False
    )

    repo.list_for_user.assert_awaited_once_with(
        42, JobFiltersDTO(search='go', tags=['a'], sort='newest'), 3, 10
    )


async def test_list_without_cvs_passes_other_filters_unchanged():
    repo = AsyncMock()
    repo.list_for_user.return_value = ([], 0)
    filters = JobFiltersDTO(search='go', posted_within_days=3)

    await ListJobsUseCase(repo).execute(
        42, filters, page=1, per_page=25, with_fit=False
    )

    repo.list_for_user.assert_awaited_once_with(42, filters, 1, 25)


async def test_list_with_cvs_keeps_min_fit_for_the_repository():
    repo = AsyncMock()
    repo.list_for_user.return_value = ([], 0)
    filters = JobFiltersDTO(min_fit=40)

    await ListJobsUseCase(repo).execute(
        42, filters, page=1, per_page=25, with_fit=True
    )

    repo.list_for_user.assert_awaited_once_with(42, filters, 1, 25)


# ---------------------------------------------------------------------------
# GetJobUseCase
# ---------------------------------------------------------------------------


def get_use_case(
    found: JobUserRow | None, cvs: list[Any]
) -> tuple[GetJobUseCase, AsyncMock, AsyncMock]:
    job_repo = AsyncMock()
    job_repo.get_for_user.return_value = found
    cv_repo = AsyncMock()
    cv_repo.list_by_user_id.return_value = cvs
    return GetJobUseCase(job_repo, cv_repo), job_repo, cv_repo


async def test_get_unknown_job_is_404():
    use_case, _, _ = get_use_case(None, [])

    with pytest.raises(ResourceNotFound, match='Job not found'):
        await use_case.execute(7, 1, with_fit=True)


async def test_get_inactive_job_without_an_application_is_404():
    use_case, _, cv_repo = get_use_case(row(job=job(is_active=False)), [])

    with pytest.raises(ResourceNotFound, match='Job not found'):
        await use_case.execute(7, 1, with_fit=True)
    cv_repo.list_by_user_id.assert_not_awaited()


async def test_get_inactive_job_with_the_callers_application_is_shown():
    use_case, job_repo, _ = get_use_case(
        row(
            job=job(is_active=False),
            application_id=5,
            application_is_draft=False,
        ),
        [],
    )

    detail = await use_case.execute(7, 1, with_fit=True)

    assert detail.is_active is False
    assert detail.application is not None
    assert detail.application.id == 5
    job_repo.get_for_user.assert_awaited_once_with(7, 1)


async def test_get_scores_every_master_cv_live_with_matched_and_missing():
    cvs = [
        base_cv(1, 1, skills=['Python']),
        base_cv(2, 1, skills=['Python', 'Go']),
    ]
    use_case, _, cv_repo = get_use_case(row(), cvs)

    detail = await use_case.execute(7, 1, with_fit=True)

    cv_repo.list_by_user_id.assert_awaited_once_with(1)
    assert [(f.base_cv_id, f.score) for f in detail.fits] == [(1, 50), (2, 100)]
    assert detail.fits[0].matched_keywords == ['python']
    assert detail.fits[0].missing_keywords == ['go']
    assert detail.fits[0].base_cv_name == 'Main'
    assert detail.best_fit is not None
    assert (detail.best_fit.base_cv_id, detail.best_fit.score) == (2, 100)
    assert detail.description_text == 'Python and Go.'
    assert detail.company_url == 'https://globex.example'


async def test_get_best_fit_is_live_not_the_stored_row():
    """The stored best fit can be stale; the detail shows the live one."""
    use_case, _, _ = get_use_case(
        row(best_fit_score=99, best_fit_base_cv_id=1),
        [base_cv(1, 1, skills=['Python'])],
    )

    detail = await use_case.execute(7, 1, with_fit=True)

    assert detail.best_fit is not None
    assert detail.best_fit.score == 50


async def test_get_best_fit_tie_goes_to_the_lowest_cv_id():
    use_case, _, _ = get_use_case(
        row(),
        [base_cv(9, 1, skills=['Python']), base_cv(4, 1, skills=['Python'])],
    )

    detail = await use_case.execute(7, 1, with_fit=True)

    assert detail.best_fit is not None
    assert detail.best_fit.base_cv_id == 4


async def test_get_without_master_cv_has_no_fit():
    use_case, _, _ = get_use_case(
        row(best_fit_score=70, best_fit_base_cv_id=1), []
    )

    detail = await use_case.execute(7, 1, with_fit=True)

    assert detail.fits == []
    assert detail.best_fit is None


async def test_get_job_without_keywords_has_no_fit_entry():
    use_case, _, _ = get_use_case(
        row(job=job(keywords=[])), [base_cv(1, 1, skills=['Python'])]
    )

    detail = await use_case.execute(7, 1, with_fit=True)

    assert detail.fits == []
    assert detail.best_fit is None


async def test_get_skips_a_master_cv_that_does_not_validate():
    broken = base_cv(2, 1, skills=['Go'])
    broken.email = None  # required by BaseCVDTO
    use_case, _, _ = get_use_case(
        row(), [base_cv(1, 1, skills=['Python']), broken]
    )

    detail = await use_case.execute(7, 1, with_fit=True)

    assert [f.base_cv_id for f in detail.fits] == [1]


# ---------------------------------------------------------------------------
# Dismiss / restore (R-029)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize('use_case_cls', [DismissJobUseCase, RestoreJobUseCase])
async def test_unknown_job_is_404_and_nothing_is_written(use_case_cls):
    job_repo = AsyncMock()
    job_repo.exists.return_value = False
    dismissal_repo = AsyncMock()

    with pytest.raises(ResourceNotFound, match='Job not found'):
        await use_case_cls(job_repo, dismissal_repo).execute(7, 1)

    dismissal_repo.dismiss.assert_not_awaited()
    dismissal_repo.restore.assert_not_awaited()


async def test_dismiss_writes_the_callers_own_row():
    job_repo = AsyncMock()
    job_repo.exists.return_value = True
    dismissal_repo = AsyncMock()

    await DismissJobUseCase(job_repo, dismissal_repo).execute(7, 1)

    dismissal_repo.dismiss.assert_awaited_once_with(1, 7)
    dismissal_repo.restore.assert_not_awaited()


async def test_restore_removes_the_callers_own_row():
    job_repo = AsyncMock()
    job_repo.exists.return_value = True
    dismissal_repo = AsyncMock()

    await RestoreJobUseCase(job_repo, dismissal_repo).execute(7, 1)

    dismissal_repo.restore.assert_awaited_once_with(1, 7)
    dismissal_repo.dismiss.assert_not_awaited()


# ---------------------------------------------------------------------------
# JobFilters (T061)
# ---------------------------------------------------------------------------


def test_filters_defaults():
    filters = JobFilters()

    assert filters.model_dump() == {
        'search': None,
        'source': None,
        'tags': [],
        'min_fit': None,
        'posted_within_days': None,
        'sort': 'newest',
        'include_dismissed': False,
    }


def test_filters_strip_search_and_source_blank_is_none():
    filters = JobFilters(search='  rust  ', source='   ')

    assert filters.search == 'rust'
    assert filters.source is None


def test_filters_tags_are_stripped_deduplicated_and_blank_dropped():
    filters = JobFilters(tags=[' python', 'python', '', 'Go '])

    assert filters.tags == ['python', 'Go']


@pytest.mark.parametrize(
    'body',
    [
        {'search': 'x' * 201},
        {'tags': [str(i) for i in range(11)]},
        {'tags': ['x' * 101]},
        {'min_fit': 101},
        {'min_fit': -1},
        {'posted_within_days': 0},
        {'posted_within_days': 16},
        {'sort': 'oldest'},
        {'unknown': True},
    ],
)
def test_filters_refuse_out_of_range(body: dict[str, Any]):
    with pytest.raises(ValidationError):
        JobFilters(**body)


def test_list_query_pages_and_ignores_unknown_keys():
    query = JobListQuery.model_validate({'per_page': 100, '_': '123'})

    assert (query.page, query.per_page) == (1, 100)
    assert JobListQuery().per_page == 25
    with pytest.raises(ValidationError):
        JobListQuery(per_page=101)
    with pytest.raises(ValidationError):
        JobListQuery(page=0)


async def test_get_without_cvs_reads_no_master_cv_and_has_no_fit():
    """ADR-0021: without "cvs" the detail answers as if the caller had no
    master CV, even when they own one that would match."""
    use_case, _, cv_repo = get_use_case(
        row(
            best_fit_score=99,
            best_fit_base_cv_id=1,
            application_id=5,
            application_is_draft=True,
        ),
        [base_cv(1, 1, skills=['Python', 'Go'])],
    )

    detail = await use_case.execute(7, 1, with_fit=False)

    cv_repo.list_by_user_id.assert_not_awaited()
    assert detail.fits == []
    assert detail.best_fit is None
    assert detail.application is not None
    assert detail.application.id == 5
    assert detail.description_text == 'Python and Go.'
