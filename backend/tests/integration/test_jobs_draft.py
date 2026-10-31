"""Start a draft from a job (KODI-047, T068; PRD 0012 R-017..R-022, R-026,
R-031) against the testcontainers Postgres.

``POST /applications/drafts/from-job`` fills a PRD 0010 draft from the job,
reuses or creates the company by PRD 0010's rules, optionally copies a
master CV into it (verbatim by default, ``keywords`` on request) and holds
one application per user per job. Every company, CV and posting here is
invented.
"""

import asyncio
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.validators import application_date as date_rules
from app.domain.models import (
    ApplicationModel,
    CompanyModel,
    JobModel,
    TailoredCVModel,
    UserModel,
)
from app.main import app as main_app
from app.presentation.dependencies import get_tailoring_resolver
from tests import msg
from tests.base_db_setup import base_data
from tests.features_seed import enrol
from tests.integration.conftest import SECOND_USER_ID, as_user
from tests.integration.jobs_seed import (
    HIMALAYAS_PLATFORM_ID,
    REMOTEOK_ID,
    REMOTEOK_PLATFORM_ID,
    seed_base_cv,
    seed_sources,
)
from tests.integration.test_jobs_api import add_job
from tests.integration.test_tailored_cv_api import (
    KEYWORDS_JOB_DESCRIPTION,
    base_cv_payload,
)

# KODI-052 (ADR-0018): every route here sits behind the "jobs" beta
# feature; ``jobs_beta`` seeds it and puts the ``async_client`` user on its
# list.
# ADR-0021: drafts and master CVs need "cvs" too; ``cvs_beta`` seeds it and
# lists the same user.
pytestmark = pytest.mark.usefixtures('jobs_beta', 'cvs_beta')


@pytest_asyncio.fixture
async def second_user(
    second_user: UserModel,
    db_session: AsyncSession,
    jobs_beta: int,
    cvs_beta: int,
) -> UserModel:
    """The conftest second user, on the "jobs" and "cvs" beta lists too."""
    await enrol(db_session, second_user.id, jobs_beta)
    await enrol(db_session, second_user.id, cvs_beta)
    return second_user


USER_ID = base_data()['user'].id
ALREADY = 'You already have an application for this job'


@pytest_asyncio.fixture
async def sources(db_session: AsyncSession) -> dict[str, int]:
    return await seed_sources(db_session)


async def start(client: AsyncClient, job_id: int, **body: Any):
    return await client.post(
        '/applications/drafts/from-job', json={'job_id': str(job_id), **body}
    )


async def started(client: AsyncClient, job_id: int, **body: Any) -> dict:
    response = await start(client, job_id, **body)
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def rows_for_job(session: AsyncSession, job_id: int) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(ApplicationModel)
            .where(ApplicationModel.job_id == job_id)
        )
        or 0
    )


async def master_cv(client: AsyncClient) -> str:
    response = await client.post('/base-cvs', json=base_cv_payload())
    assert response.status_code == 201, msg(201, response.text)
    return response.json()['id']


# ---------------------------------------------------------------------------
# AC7: the prefill
# ---------------------------------------------------------------------------


async def test_draft_is_filled_from_the_job(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(
        db_session,
        REMOTEOK_ID,
        title='Backend Engineer',
        company_name='Globex',
        company_url=None,
        job_url='https://remoteok.com/remote-jobs/42',
        description_text='Python and Django.',
    )

    draft = await started(async_client, job_id)

    assert draft['role'] == 'Backend Engineer'
    assert draft['company_name'] == 'Globex'
    assert draft['company_id'] is None
    assert draft['platform_id'] == str(REMOTEOK_PLATFORM_ID)
    assert draft['link_to_job'] == 'https://remoteok.com/remote-jobs/42'
    assert draft['job_description'] == 'Python and Django.'
    assert draft['work_mode'] == 'remote'
    assert draft['mode'] == 'active'
    assert draft['application_date'] == datetime.now(UTC).date().isoformat()
    assert draft['country'] is None
    assert draft['job_id'] == str(job_id)
    assert draft['has_cv'] is False

    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['job_id'] == str(job_id)


async def test_long_values_are_cut_to_the_application_limits(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(
        db_session,
        title='T' * 450,
        company_name='C' * 280,
        description_text='D' * 60000,
        job_url='not a url',
    )

    draft = await started(async_client, job_id)

    assert draft['role'] == 'T' * 200
    assert draft['company_name'] == 'C' * 200
    assert draft['job_description'] == 'D' * 50000
    assert draft['link_to_job'] is None


async def test_platform_is_the_sources_own(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)  # Himalayas

    draft = await started(async_client, job_id)

    assert draft['platform_id'] == str(HIMALAYAS_PLATFORM_ID)


# ---------------------------------------------------------------------------
# AC8: the company
# ---------------------------------------------------------------------------


async def test_company_with_website_becomes_private_and_is_reused(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    second_user,
):
    first_job = await add_job(
        db_session,
        company_name='Initech',
        company_url='https://initech.example',
    )
    second_job = await add_job(
        db_session,
        company_name='Initech',
        company_url='https://initech.example',
    )

    first = await started(async_client, first_job)
    second = await started(async_client, second_job)

    assert first['company_id'] is not None
    assert second['company_id'] == first['company_id']
    company = await db_session.get(CompanyModel, int(first['company_id']))
    assert company is not None
    assert company.is_public is False
    assert company.created_by == USER_ID
    assert company.name == 'Initech'

    # Another user does not see that private company: they get their own.
    async with as_user(SECOND_USER_ID, 'seconduser'):
        theirs = await started(async_client, first_job)
    assert theirs['company_id'] not in (None, first['company_id'])


async def test_company_with_website_reuses_a_visible_public_company(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    public = CompanyModel(
        name='Umbrella', url='https://umbrella.example', is_public=True
    )
    db_session.add(public)
    await db_session.commit()
    job_id = await add_job(
        db_session,
        company_name='Umbrella',
        company_url='https://umbrella.example',
    )

    draft = await started(async_client, job_id)

    assert draft['company_id'] == str(public.id)


async def test_company_without_a_valid_website_stays_free_text(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    before = await db_session.scalar(select(func.count(CompanyModel.id)))
    for url in (None, '', 'not a url', 'ftp://files.example'):
        job_id = await add_job(
            db_session, company_name='Hooli', company_url=url
        )
        draft = await started(async_client, job_id)
        assert draft['company_id'] is None, url
        assert draft['company_name'] == 'Hooli'
    after = await db_session.scalar(select(func.count(CompanyModel.id)))
    assert after == before


# ---------------------------------------------------------------------------
# AC10: one application per user per job
# ---------------------------------------------------------------------------


async def test_second_start_is_409_and_keeps_one_row(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    await started(async_client, job_id)

    again = await start(async_client, job_id)

    assert again.status_code == 409, msg(409, again.text)
    assert again.json() == {'detail': ALREADY, 'code': 'APP-1011'}
    assert await rows_for_job(db_session, job_id) == 1


async def test_two_concurrent_starts_give_one_201_and_one_409(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)

    responses = await asyncio.gather(
        start(async_client, job_id), start(async_client, job_id)
    )

    assert sorted(r.status_code for r in responses) == [201, 409]
    conflict = next(r for r in responses if r.status_code == 409)
    assert conflict.json() == {'detail': ALREADY, 'code': 'APP-1011'}
    assert await rows_for_job(db_session, job_id) == 1


async def test_another_user_may_start_the_same_job(
    async_client: AsyncClient, db_session: AsyncSession, sources, second_user
):
    job_id = await add_job(db_session)
    await started(async_client, job_id)

    async with as_user(SECOND_USER_ID, 'seconduser'):
        await started(async_client, job_id)

    assert await rows_for_job(db_session, job_id) == 2


async def test_finished_application_still_blocks_a_new_start(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session, description_text='Python')
    draft = await started(
        async_client, job_id, base_cv_id=await master_cv(async_client)
    )
    finish = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish'
    )
    assert finish.status_code == 200, msg(200, finish.text)

    again = await start(async_client, job_id)

    assert again.status_code == 409, msg(409, again.text)
    job = (await async_client.get(f'/jobs/{job_id}')).json()
    assert job['application'] == {'id': draft['id'], 'is_draft': False}


# ---------------------------------------------------------------------------
# AC2 / edges: what cannot be started
# ---------------------------------------------------------------------------


async def test_inactive_or_unknown_job_is_404_and_writes_nothing(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    inactive = await add_job(db_session, is_active=False)

    for job_id in (inactive, 999999999999):
        response = await start(async_client, job_id)
        assert response.status_code == 404, msg(404, response.text)
        assert response.json() == {
            'detail': 'Job not found',
            'code': 'JOB-1001',
        }
    assert await rows_for_job(db_session, inactive) == 0


async def test_another_users_master_cv_is_404_and_writes_nothing(
    async_client: AsyncClient, db_session: AsyncSession, sources, second_user
):
    theirs = await seed_base_cv(db_session, SECOND_USER_ID, ['python'])
    job_id = await add_job(
        db_session,
        company_name='Vandelay',
        company_url='https://vandelay.example',
    )
    companies = await db_session.scalar(select(func.count(CompanyModel.id)))

    response = await start(async_client, job_id, base_cv_id=str(theirs))

    assert response.status_code == 404, msg(404, response.text)
    assert response.json() == {'detail': 'Base CV not found', 'code': 'CV-1001'}
    assert await rows_for_job(db_session, job_id) == 0
    assert (
        await db_session.scalar(select(func.count(CompanyModel.id)))
        == companies
    )


async def test_keywords_without_a_job_description_is_422_and_writes_nothing(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session, description_text='   ')
    cv = await master_cv(async_client)

    response = await start(
        async_client, job_id, base_cv_id=cv, tailoring='keywords'
    )

    assert response.status_code == 422, msg(422, response.text)
    assert response.json() == {
        'detail': 'Add a job description to tailor by keywords',
        'code': 'CV-1005',
    }
    assert await rows_for_job(db_session, job_id) == 0


async def test_bad_body_is_422(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    for body in (
        {'job_id': str(job_id), 'tailoring': 'ai'},
        {'job_id': str(job_id), 'extra': 1},
        {},
    ):
        response = await async_client.post(
            '/applications/drafts/from-job', json=body
        )
        assert response.status_code == 422, msg(422, (body, response.text))


async def test_a_failed_copy_rolls_the_draft_back(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    class Broken:
        async def tailor(self, request):
            raise RuntimeError('tailoring exploded')

    job_id = await add_job(db_session)
    cv = await master_cv(async_client)
    main_app.dependency_overrides[get_tailoring_resolver] = lambda: (
        lambda mode: Broken()
    )
    try:
        # ASGITransport re-raises an unhandled app error instead of the 500
        # the server would answer.
        with pytest.raises(RuntimeError, match='tailoring exploded'):
            await start(async_client, job_id, base_cv_id=cv)
    finally:
        main_app.dependency_overrides.pop(get_tailoring_resolver, None)

    assert await rows_for_job(db_session, job_id) == 0
    assert (await started(async_client, job_id))['job_id'] == str(job_id)


# ---------------------------------------------------------------------------
# AC9, AC12: the master CV copy, verbatim by default
# ---------------------------------------------------------------------------


async def test_copy_is_the_default_and_verbatim(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(
        db_session, description_text=KEYWORDS_JOB_DESCRIPTION
    )
    cv = await master_cv(async_client)

    draft = await started(async_client, job_id, base_cv_id=cv)

    assert draft['has_cv'] is True
    copy = (await async_client.get(f'/applications/{draft["id"]}/cv')).json()
    master = (await async_client.get(f'/base-cvs/{cv}')).json()
    assert copy['adjustments'] == []
    assert copy['skills'] == master['skills']
    assert copy['base_cv_id'] == cv


async def test_keywords_reorders_the_copy_and_records_adjustments(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(
        db_session, description_text=KEYWORDS_JOB_DESCRIPTION
    )
    cv = await master_cv(async_client)

    draft = await started(
        async_client, job_id, base_cv_id=cv, tailoring='keywords'
    )

    assert draft['has_cv'] is True
    assert draft['job_id'] == str(job_id)
    copy = (await async_client.get(f'/applications/{draft["id"]}/cv')).json()
    assert copy['adjustments'] != []
    assert copy['was_ai_generated'] is False


# ---------------------------------------------------------------------------
# AC11, AC14: a draft like any other, and the job's mark
# ---------------------------------------------------------------------------


async def test_draft_stays_out_of_lists_and_statistics(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    before = (await async_client.get('/applications/statistics')).json()

    draft = await started(async_client, job_id)

    listed = (await async_client.get('/applications')).json()
    assert draft['id'] not in [row['id'] for row in listed]
    after = (await async_client.get('/applications/statistics')).json()
    assert after['total_applications'] == before['total_applications']
    drafts = (await async_client.get('/applications/drafts')).json()
    assert draft['id'] in [row['id'] for row in drafts]
    job = (await async_client.get(f'/jobs/{job_id}')).json()
    assert job['application'] == {'id': draft['id'], 'is_draft': True}


async def test_deleting_the_draft_clears_the_mark_and_allows_a_new_start(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    draft = await started(async_client, job_id)

    deleted = await async_client.delete(f'/applications/drafts/{draft["id"]}')
    assert deleted.status_code == 204

    job = (await async_client.get(f'/jobs/{job_id}')).json()
    assert job['application'] is None
    again = await started(async_client, job_id)
    assert again['id'] != draft['id']


async def test_finishing_shows_applied_and_keeps_the_job_link(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    draft = await started(
        async_client, job_id, base_cv_id=await master_cv(async_client)
    )

    finish = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish'
    )
    assert finish.status_code == 200, msg(200, finish.text)
    # The CLI-facing shape never carries job_id.
    assert 'job_id' not in finish.json()

    item = next(
        i
        for i in (await async_client.get('/jobs')).json()['items']
        if i['id'] == str(job_id)
    )
    assert item['application'] == {'id': draft['id'], 'is_draft': False}
    row = await db_session.get(ApplicationModel, int(draft['id']))
    assert row is not None
    assert row.job_id == job_id


async def test_application_keeps_its_link_after_the_job_leaves_the_list(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session, job_url='https://himalayas.app/jobs/9')
    draft = await started(async_client, job_id)
    job = await db_session.get(JobModel, job_id)
    assert job is not None
    job.is_active = False
    await db_session.commit()

    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['link_to_job'] == 'https://himalayas.app/jobs/9'
    assert fetched.json()['job_id'] == str(job_id)
    detail = await async_client.get(f'/jobs/{job_id}')
    assert detail.status_code == 200, msg(200, detail.text)
    assert detail.json()['application']['id'] == draft['id']


async def test_a_job_without_company_name_starts_as_unknown_company(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    """Human ruling (round 1): scrapers may store ``company_name=''``; the
    draft is created with the free text ``Unknown company`` and no company
    row is resolved or created, even when the job has a valid website."""
    companies = await db_session.scalar(select(func.count(CompanyModel.id)))
    for url in (None, 'https://nameless.example'):
        job_id = await add_job(db_session, company_name='  ', company_url=url)

        draft = await started(async_client, job_id)

        assert draft['company_name'] == 'Unknown company'
        assert draft['company_id'] is None
        row = await db_session.get(ApplicationModel, int(draft['id']))
        assert row is not None
        assert (row.company_id, row.company_name, row.job_id) == (
            None,
            'Unknown company',
            job_id,
        )
    assert (
        await db_session.scalar(select(func.count(CompanyModel.id)))
        == companies
    )


async def test_a_job_without_title_is_422_and_writes_nothing(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    """A draft needs a role: a blank title is refused before any write - no
    application, no company row (even with a valid website), the job stays
    startable."""
    companies = await db_session.scalar(select(func.count(CompanyModel.id)))
    for url in (None, 'https://untitled.example'):
        job_id = await add_job(db_session, title='   ', company_url=url)

        response = await start(async_client, job_id)

        assert response.status_code == 422, msg(422, response.text)
        assert response.json() == {
            'detail': 'This job has no title to start from',
            'code': 'APP-1012',
        }
        assert await rows_for_job(db_session, job_id) == 0
        job = (await async_client.get(f'/jobs/{job_id}')).json()
        assert job['application'] is None
    assert (
        await db_session.scalar(select(func.count(CompanyModel.id)))
        == companies
    )


async def test_losing_the_race_at_the_unique_index_is_the_same_409(
    async_client: AsyncClient, db_session: AsyncSession, sources, monkeypatch
):
    """QA N1: with the pre-check blinded, the second start reaches
    ``uq_applications_user_job`` on the real database and still answers
    the fixed 409, leaving one row - with and without a master CV."""
    from app.domain.repositories.application_repository import (
        ApplicationRepository,
    )

    async def never_found(self, user_id, job_id):
        return None

    monkeypatch.setattr(ApplicationRepository, 'get_by_job_id', never_found)
    cv = await master_cv(async_client)
    for body in ({}, {'base_cv_id': cv}):
        job_id = await add_job(db_session)
        await started(async_client, job_id, **body)

        again = await start(async_client, job_id, **body)

        assert again.status_code == 409, msg(409, again.text)
        assert again.json() == {'detail': ALREADY, 'code': 'APP-1011'}
        assert await rows_for_job(db_session, job_id) == 1


# ---------------------------------------------------------------------------
# KODI-050: the draft carries the caller's local day
# ---------------------------------------------------------------------------


def server_utc(monkeypatch: pytest.MonkeyPatch, now: datetime) -> None:
    """Freeze the one clock the date rules (and so the route) read."""
    monkeypatch.setattr(
        date_rules,
        'datetime',
        SimpleNamespace(now=lambda tz=None: now.astimezone(tz)),
    )


async def count(session: AsyncSession, model: Any) -> int:
    return int(
        await session.scalar(select(func.count()).select_from(model)) or 0
    )


async def test_west_of_utc_after_utc_midnight_dates_and_finishes_the_local_day(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    monkeypatch: pytest.MonkeyPatch,
):
    # (a) 2026-10-13 02:00 UTC is 2026-10-12 23:00 for a user in UTC-3.
    job_id = await add_job(db_session)
    cv = await master_cv(async_client)
    server_utc(monkeypatch, datetime(2026, 10, 13, 2, 0, tzinfo=UTC))

    draft = await started(
        async_client, job_id, base_cv_id=cv, application_date='2026-10-12'
    )
    assert draft['application_date'] == '2026-10-12'

    finish = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish'
    )
    assert finish.status_code == 200, msg(200, finish.text)
    assert finish.json()['application_date'] == '2026-10-12'


async def test_east_of_utc_before_utc_midnight_dates_the_local_day(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    monkeypatch: pytest.MonkeyPatch,
):
    # (b) 2026-10-12 23:30 UTC is 2026-10-13 08:30 for a user in UTC+9.
    job_id = await add_job(db_session)
    server_utc(monkeypatch, datetime(2026, 10, 12, 23, 30, tzinfo=UTC))

    draft = await started(async_client, job_id, application_date='2026-10-13')

    assert draft['application_date'] == '2026-10-13'
    row = await db_session.get(ApplicationModel, int(draft['id']))
    assert row is not None
    assert row.application_date == date(2026, 10, 13)


@pytest.mark.parametrize(
    ('day', 'detail'),
    [
        (
            '2030-01-17',
            'application_date cannot be in the future '
            '(max allowed: 2030-01-16)',
        ),
        (
            '2030-01-13',
            'application_date cannot be more than one day in the past '
            '(min allowed: 2030-01-14)',
        ),
    ],
)
async def test_a_day_outside_the_window_is_422_and_writes_nothing(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    monkeypatch: pytest.MonkeyPatch,
    day: str,
    detail: str,
):
    # (c) A new company website, a master CV: every write the start makes.
    job_id = await add_job(
        db_session,
        company_name='Hooli',
        company_url='https://hooli.example',
    )
    cv = await master_cv(async_client)
    companies = await count(db_session, CompanyModel)
    copies = await count(db_session, TailoredCVModel)
    server_utc(monkeypatch, datetime(2030, 1, 15, 12, 0, tzinfo=UTC))

    response = await start(
        async_client, job_id, base_cv_id=cv, application_date=day
    )

    assert response.status_code == 422, msg(422, response.text)
    body = response.json()
    assert body['detail'] == detail
    assert body['code'] == (
        'APP-1013' if 'in the future' in detail else 'APP-1014'
    )
    assert body['params']['field'] == 'application_date'
    assert body['params']['date'] in detail
    assert await rows_for_job(db_session, job_id) == 0
    assert await count(db_session, CompanyModel) == companies
    assert await count(db_session, TailoredCVModel) == copies


async def test_without_a_day_the_draft_gets_the_server_utc_day(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    monkeypatch: pytest.MonkeyPatch,
):
    # (d) Old clients send no application_date: UTC today, as before.
    job_id = await add_job(db_session)
    server_utc(monkeypatch, datetime(2026, 10, 13, 2, 0, tzinfo=UTC))

    draft = await started(async_client, job_id)

    assert draft['application_date'] == '2026-10-13'


async def test_a_malformed_day_is_422(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)

    response = await start(async_client, job_id, application_date='12/10/2026')

    assert response.status_code == 422, msg(422, response.text)
    assert await rows_for_job(db_session, job_id) == 0
