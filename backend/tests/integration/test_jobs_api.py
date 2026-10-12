"""The job board for the signed-in user (KODI-047, T069/T070; PRD 0012
R-007, R-010..R-015, R-029, R-031) against the testcontainers Postgres.

``create_all`` builds the schema without revision ``b28d5134631f``'s seed,
so :func:`tests.integration.jobs_seed.seed_sources` adds the two sources.
Fit rows are written straight into ``job_fit_scores`` (the worker's job,
KODI-046); the detail's fits are computed live from the master CVs.
Every company, CV and posting here is invented.
"""

from datetime import UTC, date, datetime
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config.db import get_session
from app.domain.models import (
    ApplicationModel,
    JobFitScoreModel,
    JobModel,
)
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.integration.conftest import SECOND_USER_ID, as_user
from tests.integration.jobs_seed import (
    HIMALAYAS_ID,
    REMOTEOK_ID,
    days_ago,
    seed_base_cv,
    seed_sources,
)

USER_ID = base_data()['user'].id
ADMIN_ID = base_data()['admin_user'].id

_counter = {'n': 0}


def as_admin():
    """The seeded admin's point of view. ``admin_client`` and
    ``async_client`` share the one app's overrides, so a test that needs
    both users switches identity on one client instead."""
    return as_user(ADMIN_ID, 'adminuser', is_admin=True)


async def add_job(
    session: AsyncSession, source_id: int = HIMALAYAS_ID, **fields: Any
) -> int:
    _counter['n'] += 1
    n = _counter['n']
    now = datetime.now(UTC)
    values: dict[str, Any] = {
        'source_id': source_id,
        'external_id': f'ext-{n}',
        'title': f'Engineer {n}',
        'company_name': f'Company {n}',
        'job_url': f'https://jobs.example/{n}',
        'description_text': 'Plain posting text.',
        'keywords': ['python'],
        'content_hash': '0' * 64,
        'posted_at': now,
        'first_seen_at': now,
        'last_seen_at': now,
        'is_active': True,
    }
    values.update(fields)
    job = JobModel(**values)
    session.add(job)
    await session.commit()
    return job.id


async def add_fit(
    session: AsyncSession,
    user_id: int,
    job_id: int,
    base_cv_id: int,
    score: int,
) -> None:
    session.add(
        JobFitScoreModel(
            user_id=user_id,
            job_id=job_id,
            base_cv_id=base_cv_id,
            score=score,
            computed_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def add_application(
    session: AsyncSession, user_id: int, job_id: int, is_draft: bool = False
) -> int:
    application = ApplicationModel(
        user_id=user_id,
        platform_id=base_data()['plat_linkedin'].id,
        application_date=date(2026, 1, 1),
        role='Engineer',
        mode='active',
        company_name='Acme',
        is_draft=is_draft,
        job_id=job_id,
    )
    session.add(application)
    await session.commit()
    return application.id


async def ids(client: AsyncClient, **params: Any) -> list[str]:
    response = await client.get('/jobs', params=params)
    assert response.status_code == 200, msg(200, response.text)
    return [item['id'] for item in response.json()['items']]


@pytest_asyncio.fixture
async def sources(db_session: AsyncSession) -> dict[str, int]:
    return await seed_sources(db_session)


@pytest_asyncio.fixture
async def raw_client(async_engine: AsyncEngine):
    """No auth override at all - the real 401 path."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with maker() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(
        transport=ASGITransport(app=main_app), base_url='http://test/api'
    ) as client:
        yield client
    main_app.dependency_overrides.pop(get_session, None)


# ---------------------------------------------------------------------------
# AC3: the list - newest first, 25 per page, every summary field
# ---------------------------------------------------------------------------


async def test_list_is_newest_first_25_per_page_with_total(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    created = [
        await add_job(db_session, posted_at=days_ago(1 + i / 10))
        for i in range(27)
    ]
    newest_first = [str(job_id) for job_id in created]

    first = await async_client.get('/jobs')
    assert first.status_code == 200, msg(200, first.text)
    body = first.json()
    assert body['total'] == 27
    assert body['page'] == 1
    assert body['per_page'] == 25
    assert body['total_pages'] == 2
    assert [item['id'] for item in body['items']] == newest_first[:25]

    second = (await async_client.get('/jobs', params={'page': 2})).json()
    assert [item['id'] for item in second['items']] == newest_first[25:]

    beyond = (await async_client.get('/jobs', params={'page': 3})).json()
    assert beyond['items'] == []
    assert beyond['total'] == 27


async def test_newest_uses_first_seen_when_unpublished_and_id_breaks_ties(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    same = days_ago(3)
    older = await add_job(db_session, posted_at=days_ago(5))
    tie_a = await add_job(db_session, posted_at=same)
    tie_b = await add_job(db_session, posted_at=same)
    # No publication date: it counts from when the worker first saw it.
    unpublished = await add_job(
        db_session, posted_at=None, first_seen_at=days_ago(1)
    )

    assert await ids(async_client) == [
        str(unpublished),
        str(max(tie_a, tie_b)),
        str(min(tie_a, tie_b)),
        str(older),
    ]


async def test_summary_carries_every_field_and_the_callers_best_fit(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    posted = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
    job_id = await add_job(
        db_session,
        REMOTEOK_ID,
        title='Backend Engineer',
        company_name='Globex',
        location_text='Remote, EU',
        employment_type='Full-time',
        salary_text='$100k - $120k',
        tags=['python', 'django'],
        posted_at=posted,
        first_seen_at=days_ago(0),
        job_url='https://remoteok.com/jobs/1',
    )
    low = await seed_base_cv(db_session, USER_ID, ['python'], name='Low')
    high = await seed_base_cv(db_session, USER_ID, ['python'], name='High')
    await add_fit(db_session, USER_ID, job_id, low, 40)
    await add_fit(db_session, USER_ID, job_id, high, 75)

    item = (await async_client.get('/jobs')).json()['items'][0]

    assert item == {
        'id': str(job_id),
        'source': {'code': 'remoteok', 'name': 'RemoteOK'},
        'title': 'Backend Engineer',
        'company_name': 'Globex',
        'location_text': 'Remote, EU',
        'employment_type': 'Full-time',
        'salary_text': '$100k - $120k',
        'tags': ['python', 'django'],
        'posted_at': '2026-10-01T12:00:00Z',
        'job_url': 'https://remoteok.com/jobs/1',
        'is_active': True,
        'best_fit': {'base_cv_id': str(high), 'score': 75},
        'dismissed': False,
        'application': None,
    }


async def test_best_fit_tie_goes_to_the_lowest_master_cv_id(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    first = await seed_base_cv(db_session, USER_ID, ['python'], name='A')
    second = await seed_base_cv(db_session, USER_ID, ['python'], name='B')
    await add_fit(db_session, USER_ID, job_id, second, 60)
    await add_fit(db_session, USER_ID, job_id, first, 60)

    item = (await async_client.get('/jobs')).json()['items'][0]

    assert item['best_fit'] == {
        'base_cv_id': str(min(first, second)),
        'score': 60,
    }


# ---------------------------------------------------------------------------
# AC2: a posting off the list stays; its detail is only for its applicant
# ---------------------------------------------------------------------------


async def test_inactive_jobs_are_not_listed(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    listed = await add_job(db_session)
    await add_job(db_session, is_active=False)

    assert await ids(async_client) == [str(listed)]
    body = (await async_client.get('/jobs')).json()
    assert body['total'] == 1


async def test_detail_of_inactive_job_is_404_without_an_application(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session, is_active=False)

    response = await async_client.get(f'/jobs/{job_id}')

    assert response.status_code == 404, msg(404, response.status_code)
    assert response.json()['detail'] == 'Job not found'


async def test_detail_of_inactive_job_is_200_for_the_caller_who_applied(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    second_user,
):
    job_id = await add_job(db_session, is_active=False)
    application_id = await add_application(db_session, USER_ID, job_id)

    response = await async_client.get(f'/jobs/{job_id}')
    assert response.status_code == 200, msg(200, response.text)
    body = response.json()
    assert body['is_active'] is False
    assert body['application'] == {'id': str(application_id), 'is_draft': False}

    # Another user, with no application from it, still gets the 404.
    async with as_user(SECOND_USER_ID, 'seconduser'):
        other = await async_client.get(f'/jobs/{job_id}')
    assert other.status_code == 404, msg(404, other.status_code)


async def test_unknown_job_is_404(async_client: AsyncClient, sources):
    response = await async_client.get('/jobs/999999999999')

    assert response.status_code == 404, msg(404, response.status_code)


# ---------------------------------------------------------------------------
# AC4: search, filters, sort
# ---------------------------------------------------------------------------


async def test_search_matches_title_company_and_description_ignoring_case(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    by_title = await add_job(db_session, title='Senior RUST Developer')
    by_company = await add_job(db_session, company_name='Rustacean Labs')
    by_description = await add_job(
        db_session, description_text='We write rust every day.'
    )
    await add_job(db_session, title='Go developer')

    found = await ids(async_client, search='  rust  ')

    assert set(found) == {str(by_title), str(by_company), str(by_description)}


async def test_search_wildcards_match_only_themselves(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    percent = await add_job(db_session, title='100% remote')
    await add_job(db_session, title='Remote, 100 percent')
    underscore = await add_job(db_session, title='snake_case lover')
    await add_job(db_session, title='snakeXcase lover')

    assert await ids(async_client, search='100%') == [str(percent)]
    assert await ids(async_client, search='e_c') == [str(underscore)]


async def test_source_filter_by_code(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    himalayas = await add_job(db_session, HIMALAYAS_ID)
    remoteok = await add_job(db_session, REMOTEOK_ID)

    assert await ids(async_client, source='himalayas') == [str(himalayas)]
    assert await ids(async_client, source='remoteok') == [str(remoteok)]
    assert await ids(async_client, source='nowhere') == []


async def test_tags_filter_needs_every_chosen_tag(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    both = await add_job(db_session, tags=['python', 'django', 'aws'])
    one = await add_job(db_session, tags=['python'])
    await add_job(db_session, tags=['go'])

    assert set(await ids(async_client, tags=['python'])) == {
        str(both),
        str(one),
    }
    assert await ids(async_client, tags=['python', 'django']) == [str(both)]
    assert await ids(async_client, tags=['python', 'go']) == []


async def test_min_fit_keeps_at_least_that_fit_and_drops_jobs_without_fit(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    cv = await seed_base_cv(db_session, USER_ID, ['python'])
    equal = await add_job(db_session)
    above = await add_job(db_session)
    below = await add_job(db_session)
    await add_job(db_session)  # no fit row at all
    await add_fit(db_session, USER_ID, equal, cv, 50)
    await add_fit(db_session, USER_ID, above, cv, 90)
    await add_fit(db_session, USER_ID, below, cv, 49)

    assert set(await ids(async_client, min_fit=50)) == {str(equal), str(above)}
    # min_fit 0 still drops a job with no fit (plan corrections 19).
    assert set(await ids(async_client, min_fit=0)) == {
        str(equal),
        str(above),
        str(below),
    }


async def test_posted_within_days_counts_from_publication_else_first_seen(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    recent = await add_job(db_session, posted_at=days_ago(2))
    await add_job(db_session, posted_at=days_ago(4))
    recent_unpublished = await add_job(
        db_session, posted_at=None, first_seen_at=days_ago(1)
    )
    # Published long ago, first seen today: publication wins.
    await add_job(db_session, posted_at=days_ago(6), first_seen_at=days_ago(0))

    assert set(await ids(async_client, posted_within_days=3)) == {
        str(recent),
        str(recent_unpublished),
    }


async def test_sort_by_fit_puts_best_first_no_fit_last_then_newest(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    cv = await seed_base_cv(db_session, USER_ID, ['python'])
    no_fit_new = await add_job(db_session, posted_at=days_ago(1))
    no_fit_old = await add_job(db_session, posted_at=days_ago(5))
    mid_old = await add_job(db_session, posted_at=days_ago(4))
    mid_new = await add_job(db_session, posted_at=days_ago(2))
    top = await add_job(db_session, posted_at=days_ago(6))
    await add_fit(db_session, USER_ID, mid_old, cv, 50)
    await add_fit(db_session, USER_ID, mid_new, cv, 50)
    await add_fit(db_session, USER_ID, top, cv, 90)

    assert await ids(async_client, sort='fit') == [
        str(top),
        str(mid_new),
        str(mid_old),
        str(no_fit_new),
        str(no_fit_old),
    ]
    # And ``newest`` ignores the fit.
    assert (await ids(async_client, sort='newest'))[0] == str(no_fit_new)


async def test_filters_combine_and_total_counts_the_matches(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    match = await add_job(
        db_session, REMOTEOK_ID, title='Python dev', tags=['python']
    )
    await add_job(db_session, HIMALAYAS_ID, title='Python dev', tags=['python'])
    await add_job(db_session, REMOTEOK_ID, title='Python dev', tags=['go'])

    body = (
        await async_client.get(
            '/jobs',
            params={'search': 'python', 'source': 'remoteok', 'tags': 'python'},
        )
    ).json()

    assert [item['id'] for item in body['items']] == [str(match)]
    assert body['total'] == 1
    assert body['total_pages'] == 1


# ---------------------------------------------------------------------------
# AC5, AC6: the detail - description, link, every master CV's fit
# ---------------------------------------------------------------------------


async def test_detail_has_description_link_and_each_master_cv_fit(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(
        db_session,
        description_text='Python and Django, on AWS.',
        company_url='https://globex.example',
        job_url='https://himalayas.app/jobs/globex',
        keywords=['python', 'django', 'aws', 'kubernetes'],
    )
    full = await seed_base_cv(
        db_session, USER_ID, ['Python', 'Django', 'AWS'], name='Full'
    )
    half = await seed_base_cv(db_session, USER_ID, ['Python'], name='Half')

    response = await async_client.get(f'/jobs/{job_id}')
    assert response.status_code == 200, msg(200, response.text)
    body = response.json()

    assert body['description_text'] == 'Python and Django, on AWS.'
    assert body['job_url'] == 'https://himalayas.app/jobs/globex'
    assert body['company_url'] == 'https://globex.example'
    fits = {fit['base_cv_id']: fit for fit in body['fits']}
    assert fits[str(full)] == {
        'base_cv_id': str(full),
        'base_cv_name': 'Full',
        'score': 75,
        'matched_keywords': ['python', 'django', 'aws'],
        'missing_keywords': ['kubernetes'],
    }
    assert fits[str(half)] == {
        'base_cv_id': str(half),
        'base_cv_name': 'Half',
        'score': 25,
        'matched_keywords': ['python'],
        'missing_keywords': ['django', 'aws', 'kubernetes'],
    }
    assert body['best_fit'] == {'base_cv_id': str(full), 'score': 75}


async def test_no_master_cv_means_no_fit_anywhere(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session, keywords=['python'])

    item = (await async_client.get('/jobs')).json()['items'][0]
    detail = (await async_client.get(f'/jobs/{job_id}')).json()

    assert item['best_fit'] is None
    assert detail['best_fit'] is None
    assert detail['fits'] == []


async def test_a_job_without_keywords_has_no_fit_entry(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session, keywords=[])
    await seed_base_cv(db_session, USER_ID, ['python'])

    detail = (await async_client.get(f'/jobs/{job_id}')).json()

    assert detail['fits'] == []
    assert detail['best_fit'] is None


# ---------------------------------------------------------------------------
# Per-user fits (ADR-0004): nobody sees another user's, admins included
# ---------------------------------------------------------------------------


async def test_each_user_sees_only_their_own_fit_admin_included(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    second_user,
):
    job_id = await add_job(db_session, keywords=['python', 'go'])
    mine = await seed_base_cv(db_session, USER_ID, ['python'])
    theirs = await seed_base_cv(db_session, SECOND_USER_ID, ['python', 'go'])
    await add_fit(db_session, USER_ID, job_id, mine, 50)
    await add_fit(db_session, SECOND_USER_ID, job_id, theirs, 100)

    item = (await async_client.get('/jobs')).json()['items'][0]
    assert item['best_fit'] == {'base_cv_id': str(mine), 'score': 50}
    detail = (await async_client.get(f'/jobs/{job_id}')).json()
    assert [fit['base_cv_id'] for fit in detail['fits']] == [str(mine)]

    async with as_user(SECOND_USER_ID, 'seconduser'):
        item = (await async_client.get('/jobs')).json()['items'][0]
        detail = (await async_client.get(f'/jobs/{job_id}')).json()
    assert item['best_fit'] == {'base_cv_id': str(theirs), 'score': 100}
    assert [fit['base_cv_id'] for fit in detail['fits']] == [str(theirs)]

    # The admin has no master CV: no fit, not anybody else's.
    async with as_admin():
        admin_item = (await async_client.get('/jobs')).json()['items'][0]
        admin_detail = (await async_client.get(f'/jobs/{job_id}')).json()
        # And min_fit only counts the caller's own fit.
        admin_min_fit = await ids(async_client, min_fit=0)
    assert admin_item['best_fit'] is None
    assert admin_detail['fits'] == []
    assert admin_min_fit == []


async def test_admin_sees_their_own_fit(
    admin_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)
    cv = await seed_base_cv(db_session, ADMIN_ID, ['python'])
    other = await seed_base_cv(db_session, USER_ID, ['python'])
    await add_fit(db_session, ADMIN_ID, job_id, cv, 30)
    await add_fit(db_session, USER_ID, job_id, other, 99)

    item = (await admin_client.get('/jobs')).json()['items'][0]

    assert item['best_fit'] == {'base_cv_id': str(cv), 'score': 30}


async def test_application_mark_is_the_callers_own_in_any_state(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    second_user,
):
    draft_job = await add_job(db_session)
    applied_job = await add_job(db_session)
    draft_id = await add_application(
        db_session, USER_ID, draft_job, is_draft=True
    )
    applied_id = await add_application(db_session, USER_ID, applied_job)

    items = {
        item['id']: item
        for item in (await async_client.get('/jobs')).json()['items']
    }
    assert items[str(draft_job)]['application'] == {
        'id': str(draft_id),
        'is_draft': True,
    }
    assert items[str(applied_job)]['application'] == {
        'id': str(applied_id),
        'is_draft': False,
    }

    async with as_user(SECOND_USER_ID, 'seconduser'):
        theirs = (await async_client.get('/jobs')).json()['items']
    assert all(item['application'] is None for item in theirs)


# ---------------------------------------------------------------------------
# Validation and auth
# ---------------------------------------------------------------------------


async def test_anonymous_is_401(raw_client: AsyncClient, db_session, sources):
    job_id = await add_job(db_session)

    assert (await raw_client.get('/jobs')).status_code == 401
    assert (await raw_client.get(f'/jobs/{job_id}')).status_code == 401
    assert (
        await raw_client.put(f'/jobs/{job_id}/dismissal')
    ).status_code == 401
    assert (
        await raw_client.delete(f'/jobs/{job_id}/dismissal')
    ).status_code == 401


async def test_out_of_range_query_is_422(async_client: AsyncClient, sources):
    bad: list[dict[str, Any]] = [
        {'per_page': 101},
        {'per_page': 0},
        {'page': 0},
        {'tags': [f't{i}' for i in range(11)]},
        {'min_fit': 101},
        {'min_fit': -1},
        {'posted_within_days': 16},
        {'posted_within_days': 0},
        {'sort': 'oldest'},
        {'search': 'x' * 201},
    ]
    for params in bad:
        response = await async_client.get('/jobs', params=params)
        assert response.status_code == 422, msg(422, (params, response.text))


async def test_edge_values_are_accepted(async_client: AsyncClient, sources):
    good: list[dict[str, Any]] = [
        {'per_page': 100},
        {'per_page': 1},
        {'tags': [f't{i}' for i in range(10)]},
        {'min_fit': 100},
        {'min_fit': 0},
        {'posted_within_days': 15},
        {'posted_within_days': 1},
        {'search': 'x' * 200},
    ]
    for params in good:
        response = await async_client.get('/jobs', params=params)
        assert response.status_code == 200, msg(200, (params, response.text))


# ---------------------------------------------------------------------------
# AC13: dismiss and restore (T070)
# ---------------------------------------------------------------------------


async def test_dismiss_hides_include_dismissed_shows_restore_brings_back(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    kept = await add_job(db_session, posted_at=days_ago(2))
    job_id = await add_job(db_session, posted_at=days_ago(1))

    put = await async_client.put(f'/jobs/{job_id}/dismissal')
    assert put.status_code == 204, msg(204, put.text)
    assert put.content == b''

    assert await ids(async_client) == [str(kept)]
    body = (await async_client.get('/jobs')).json()
    assert body['total'] == 1

    shown = (
        await async_client.get('/jobs', params={'include_dismissed': True})
    ).json()
    assert [(i['id'], i['dismissed']) for i in shown['items']] == [
        (str(job_id), True),
        (str(kept), False),
    ]
    detail = (await async_client.get(f'/jobs/{job_id}')).json()
    assert detail['dismissed'] is True

    delete = await async_client.delete(f'/jobs/{job_id}/dismissal')
    assert delete.status_code == 204, msg(204, delete.text)
    assert await ids(async_client) == [str(job_id), str(kept)]


async def test_dismiss_and_restore_are_idempotent(
    async_client: AsyncClient, db_session: AsyncSession, sources
):
    job_id = await add_job(db_session)

    for _ in range(2):
        response = await async_client.put(f'/jobs/{job_id}/dismissal')
        assert response.status_code == 204, msg(204, response.text)
    assert await ids(async_client) == []

    for _ in range(2):
        response = await async_client.delete(f'/jobs/{job_id}/dismissal')
        assert response.status_code == 204, msg(204, response.text)
    assert await ids(async_client) == [str(job_id)]


async def test_dismissal_is_per_user(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sources,
    second_user,
):
    job_id = await add_job(db_session)

    await async_client.put(f'/jobs/{job_id}/dismissal')

    assert await ids(async_client) == []
    async with as_user(SECOND_USER_ID, 'seconduser'):
        assert await ids(async_client) == [str(job_id)]
        # The other user's restore does not touch the caller's dismissal.
        await async_client.delete(f'/jobs/{job_id}/dismissal')
    assert await ids(async_client) == []
    async with as_admin():
        assert await ids(async_client) == [str(job_id)]


async def test_dismissal_of_unknown_job_is_404(
    async_client: AsyncClient, sources
):
    for method in ('put', 'delete'):
        response = await getattr(async_client, method)(
            '/jobs/999999999999/dismissal'
        )
        assert response.status_code == 404, msg(404, response.status_code)
        assert response.json()['detail'] == 'Job not found'
