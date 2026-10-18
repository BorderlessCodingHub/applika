"""The "cvs" beta gate against the testcontainers Postgres (ADR-0018,
ADR-0021; PRD 0015 R-003..R-005, R-008..R-010).

The ``cvs`` row is inserted as revision ``f28e3d9705dd`` seeds it (``beta``,
no opt-out) and ``jobs`` as ``641001baff09`` does. The ``world`` fixture
builds everything through the API with the ``async_client`` user on both
lists, then takes them off the ``cvs`` list: the user starts with "jobs"
and without "cvs", the seeded admin with both. Every gated answer is
compared byte for byte with the answer to a route that does not exist.
"""

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.application.use_cases.jobs.recompute_fit import RecomputeFitUseCase
from app.config.db import get_session
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.job_fit_score_repository import (
    JobFitScoreRepository,
)
from app.domain.repositories.job_repository import JobRepository
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.features_seed import (
    CVS_FEATURE_ID,
    JOBS_FEATURE_ID,
    enrol,
    opt_out,
    seed_cvs_feature,
    seed_jobs_feature,
)
from tests.integration.conftest import as_user
from tests.integration.jobs_seed import seed_sources
from tests.integration.test_application_drafts import draft_payload
from tests.integration.test_jobs_api import add_job
from tests.integration.test_tailored_cv_api import (
    application_payload,
    base_cv_payload,
    update_payload,
)

USER_ID = base_data()['user'].id
ADMIN_ID = base_data()['admin_user'].id
NOT_FOUND = {'detail': 'Not Found'}

# Both words appear in base_cv_payload()'s headline: a fit of 100.
FIT_KEYWORDS = ['backend', 'engineer']


def as_admin():
    return as_user(ADMIN_ID, 'adminuser', is_admin=True)


async def unlist(session: AsyncSession, feature_id: int) -> None:
    await session.execute(
        text(
            'DELETE FROM feature_beta_users '
            'WHERE feature_id = :feature AND user_id = :user'
        ),
        {'feature': feature_id, 'user': USER_ID},
    )
    await session.commit()


async def set_stage(session: AsyncSession, stage: str) -> None:
    await session.execute(
        text("UPDATE features SET stage = :stage WHERE key = 'cvs'"),
        {'stage': stage},
    )
    await session.commit()


async def recompute(engine: AsyncEngine, base_cv_id: int) -> None:
    """The worker's fit recompute, on a session of its own (as the task)."""
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        await RecomputeFitUseCase(
            BaseCVRepository(session),
            JobRepository(session),
            JobFitScoreRepository(session),
        ).execute(base_cv_id=base_cv_id)


@pytest_asyncio.fixture
async def world(
    async_client: AsyncClient, async_engine: AsyncEngine, db_session
) -> AsyncIterator[dict[str, Any]]:
    """One of everything a cvs route can name, owned by the ``async_client``
    user: a master CV, an application with a CV copy and a job description,
    a draft with a CV copy, and two listed jobs (the older one fits)."""
    await seed_cvs_feature(db_session)
    await seed_jobs_feature(db_session)
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    await enrol(db_session, USER_ID, JOBS_FEATURE_ID)
    await seed_sources(db_session)
    fitting_job = await add_job(db_session, keywords=FIT_KEYWORDS)
    newer_job = await add_job(db_session, keywords=['cobol'])
    start_job = await add_job(db_session, keywords=['cobol'])
    await db_session.execute(
        text(
            "UPDATE jobs SET posted_at = posted_at - interval '2 days' "
            'WHERE id = :id'
        ),
        {'id': fitting_job},
    )
    await db_session.commit()

    cv = await async_client.post('/base-cvs', json=base_cv_payload())
    assert cv.status_code == 201, msg(201, cv.text)
    application = await async_client.post(
        '/applications', json=application_payload()
    )
    assert application.status_code == 201, msg(201, application.text)
    app_id = application.json()['id']
    copy = await async_client.post(
        f'/applications/{app_id}/cv', json={'base_cv_id': cv.json()['id']}
    )
    assert copy.status_code == 201, msg(201, copy.text)
    draft = await async_client.post(
        '/applications/drafts', json=draft_payload()
    )
    assert draft.status_code == 201, msg(201, draft.text)
    draft_id = draft.json()['id']
    draft_copy = await async_client.post(
        f'/applications/{draft_id}/cv', json={'base_cv_id': cv.json()['id']}
    )
    assert draft_copy.status_code == 201, msg(201, draft_copy.text)
    await recompute(async_engine, int(cv.json()['id']))

    await unlist(db_session, CVS_FEATURE_ID)
    yield {
        'base_cv_id': cv.json()['id'],
        'application_id': app_id,
        'draft_id': draft_id,
        'fitting_job': fitting_job,
        'newer_job': newer_job,
        'start_job': start_job,
    }


def gated_calls(w: dict[str, Any]) -> list[tuple[str, str, dict | None]]:
    """Every route the "cvs" gate covers, with a well-formed request, the
    writes that destroy last."""
    cv, app, draft = w['base_cv_id'], w['application_id'], w['draft_id']
    return [
        ('GET', '/base-cvs', None),
        ('POST', '/base-cvs', base_cv_payload(name='Second')),
        ('GET', f'/base-cvs/{cv}', None),
        ('PATCH', f'/base-cvs/{cv}', {'name': 'Renamed'}),
        ('POST', f'/base-cvs/{cv}/pdf', None),
        ('GET', f'/base-cvs/{cv}/markdown', None),
        ('POST', f'/applications/{app}/cv', {'base_cv_id': cv}),
        ('GET', f'/applications/{app}/cv', None),
        ('PUT', f'/applications/{app}/cv', update_payload()),
        ('POST', f'/applications/{app}/cv/pdf', None),
        ('GET', f'/applications/{app}/cv/markdown', None),
        ('GET', f'/applications/{app}/cv/diff/markdown', None),
        ('GET', f'/applications/{app}/cv/diff/pdf', None),
        ('GET', f'/applications/{app}/cv/fit', None),
        ('POST', '/applications/drafts', draft_payload(role='Other')),
        ('GET', '/applications/drafts', None),
        ('GET', f'/applications/drafts/{draft}', None),
        ('PUT', f'/applications/drafts/{draft}', draft_payload(role='Edit')),
        (
            'POST',
            '/applications/drafts/from-job',
            {'job_id': str(w['start_job']), 'base_cv_id': cv},
        ),
        ('POST', f'/applications/drafts/{draft}/finish', None),
        ('DELETE', f'/applications/{app}/cv', None),
        ('DELETE', f'/applications/drafts/{draft}', None),
        ('DELETE', f'/base-cvs/{cv}', None),
    ]


# What each call answers once the gate lets it through (the draft is
# finished before it is deleted, so that delete is the drafts 404).
OPEN_STATUSES = [
    200, 201, 200, 200, 200, 200, 409, 200, 200, 200, 200, 200, 200, 200,
    201, 200, 200, 200, 201, 200, 204, 404, 204,
]  # fmt: skip


async def call(
    client: AsyncClient,
    method: str,
    path: str,
    body: dict | None,
    **kwargs: Any,
) -> Response:
    if body is None:
        return await client.request(method, path, **kwargs)
    return await client.request(method, path, json=body, **kwargs)


async def unknown_route(client: AsyncClient, suffix: str = '') -> Response:
    response = await client.get(
        f'/no-such-route{suffix}', follow_redirects=False
    )
    assert response.status_code == 404
    return response


async def assert_hidden(
    client: AsyncClient,
    calls: list[tuple[str, str, dict | None]],
    suffix: str = '',
) -> None:
    reference = await unknown_route(client, suffix)
    for method, path, body in calls:
        response = await call(
            client, method, f'{path}{suffix}', body, follow_redirects=False
        )
        assert response.status_code == 404, msg(404, (method, path))
        assert 'location' not in response.headers, (method, path)
        assert response.content == reference.content, (method, path)
        assert (
            response.headers['content-type']
            == reference.headers['content-type']
        ), (method, path)


async def assert_open(client: AsyncClient) -> None:
    for path in ('/base-cvs', '/applications/drafts'):
        response = await client.get(path)
        assert response.status_code == 200, msg(200, (path, response.text))


async def assert_closed(client: AsyncClient) -> None:
    for path in ('/base-cvs', '/applications/drafts'):
        response = await client.get(path)
        assert response.status_code == 404, msg(404, path)
        assert response.json() == NOT_FOUND


async def rows(session: AsyncSession) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for table in ('base_cvs', 'tailored_cvs', 'applications'):
        result = await session.execute(
            text(f'SELECT * FROM {table} WHERE user_id = :id ORDER BY id'),
            {'id': USER_ID},
        )
        out[table] = [dict(row) for row in result.mappings().all()]
    return out


# ---------------------------------------------------------------------------
# R-004, R-005: without "cvs" every CV and draft route is an unknown route
# ---------------------------------------------------------------------------


async def test_unlisted_user_gets_the_unknown_route_404_on_every_cvs_route(
    async_client: AsyncClient, world
):
    await assert_hidden(async_client, gated_calls(world))


async def test_nothing_is_written_or_removed_through_a_hidden_route(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    before = await rows(db_session)

    await assert_hidden(async_client, gated_calls(world))

    assert await rows(db_session) == before


@pytest.mark.parametrize('suffix', ['/', '//'])
async def test_slash_suffixed_cvs_paths_are_unknown_routes(
    async_client: AsyncClient, db_session: AsyncSession, world, suffix: str
):
    """Every route has a twin: ``/base-cvs/``, ``/applications/drafts/``,
    ``/applications/{id}/cv/`` etc. answer what ``GET /no-such-route/``
    answers - never Starlette's 307."""
    before = await rows(db_session)

    await assert_hidden(async_client, gated_calls(world), suffix)

    assert await rows(db_session) == before


async def test_well_formed_json_with_wrong_fields_is_still_404(
    async_client: AsyncClient, world
):
    reference = await unknown_route(async_client)
    app, draft = world['application_id'], world['draft_id']
    for method, path in (
        ('POST', '/base-cvs'),
        ('PATCH', f'/base-cvs/{world["base_cv_id"]}'),
        ('POST', f'/applications/{app}/cv'),
        ('PUT', f'/applications/{app}/cv'),
        ('POST', '/applications/drafts'),
        ('PUT', f'/applications/drafts/{draft}'),
        ('POST', f'/applications/drafts/{draft}/finish'),
        ('POST', '/applications/drafts/from-job'),
    ):
        response = await async_client.request(method, path, json={'nope': 1})
        assert response.status_code == 404, msg(404, (method, path))
        assert response.content == reference.content, (method, path)
    for path in ('/base-cvs/not-a-snowflake', '/applications/drafts/nope'):
        response = await async_client.get(path)
        assert response.content == reference.content, path
    # A path the twin of /{draft_id} reads as an invalid id (422 with
    # "cvs") is the gate's 404 without it, slash or not.
    for suffix in ('', '/'):
        for method in ('GET', 'PUT', 'DELETE'):
            response = await async_client.request(
                method,
                f'/applications/drafts/from-job{suffix}',
                follow_redirects=False,
            )
            assert response.status_code == 404, (method, suffix)
            assert response.json() == NOT_FOUND


@pytest.mark.parametrize('suffix', ['', '/'])
async def test_anonymous_gets_todays_401_not_the_404(
    async_engine: AsyncEngine, world, suffix: str
):
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with maker() as session:
            yield session

    main_app.dependency_overrides.clear()
    main_app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(
        transport=ASGITransport(app=main_app), base_url='http://test/api'
    ) as client:
        for method, path, body in gated_calls(world):
            response = await call(
                client, method, f'{path}{suffix}', body, follow_redirects=False
            )
            assert response.status_code == 401, msg(401, (method, path))
            assert response.json() == {'detail': 'Not authenticated'}


# ---------------------------------------------------------------------------
# R-003: the access rule - list, admin, opt-out, general
# ---------------------------------------------------------------------------


async def test_listed_user_reaches_every_handler(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """The positive control: the 404s above are the gate, not missing rows
    - listed (with "jobs" too), every call reaches its handler."""
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    for (method, path, body), status in zip(
        gated_calls(world), OPEN_STATUSES, strict=True
    ):
        response = await call(async_client, method, path, body)
        assert response.status_code == status, msg(
            status, (method, path, response.text)
        )
        if status == 404:
            assert response.json() != NOT_FOUND, (method, path)


@pytest.mark.parametrize('suffix', ['/', '//'])
async def test_slash_suffixed_paths_are_served_directly_with_cvs(
    async_client: AsyncClient, db_session: AsyncSession, world, suffix: str
):
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    for (method, path, body), status in zip(
        gated_calls(world), OPEN_STATUSES, strict=True
    ):
        response = await call(
            async_client, method, f'{path}{suffix}', body,
            follow_redirects=False,
        )  # fmt: skip
        assert response.status_code == status, msg(
            status, (method, path, response.text)
        )


async def test_admin_has_cvs_by_default_and_loses_it_with_an_opt_out(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    async with as_admin():
        await assert_open(async_client)

        await opt_out(db_session, ADMIN_ID, CVS_FEATURE_ID)
        await assert_closed(async_client)
        # The jobs opt-out is another key: the admin keeps "jobs".
        assert (await async_client.get('/jobs')).status_code == 200


async def test_general_opens_to_the_unlisted_and_beta_hides_again(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await set_stage(db_session, 'general')
    await assert_open(async_client)

    await set_stage(db_session, 'beta')
    await assert_closed(async_client)


async def test_listing_and_unlisting_apply_on_the_next_request(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    await assert_open(async_client)
    features = (await async_client.get('/users/me/features')).json()
    assert {'key': 'cvs', 'stage': 'beta'} in features['features']

    await unlist(db_session, CVS_FEATURE_ID)
    await assert_closed(async_client)
    features = (await async_client.get('/users/me/features')).json()
    assert 'cvs' not in [f['key'] for f in features['features']]


# ---------------------------------------------------------------------------
# R-005: the fit and a draft from a job need both features
# ---------------------------------------------------------------------------


def both_key_calls(w: dict[str, Any]) -> list[tuple[str, str, dict | None]]:
    return [
        ('GET', f'/applications/{w["application_id"]}/cv/fit', None),
        (
            'POST',
            '/applications/drafts/from-job',
            {'job_id': str(w['start_job']), 'base_cv_id': w['base_cv_id']},
        ),
    ]


async def test_fit_and_from_job_need_cvs_and_jobs(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    # "jobs" only (the world's state).
    await assert_hidden(async_client, both_key_calls(world))
    await assert_hidden(async_client, both_key_calls(world), '/')

    # "cvs" only.
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    await unlist(db_session, JOBS_FEATURE_ID)
    await assert_hidden(async_client, both_key_calls(world))
    await assert_hidden(async_client, both_key_calls(world), '/')
    await assert_open(async_client)

    # Both.
    await enrol(db_session, USER_ID, JOBS_FEATURE_ID)
    for (method, path, body), status in zip(
        both_key_calls(world), [200, 201], strict=True
    ):
        response = await call(async_client, method, path, body)
        assert response.status_code == status, msg(status, response.text)


async def test_keywords_tailoring_needs_cvs_through_the_router(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """``tailoring: keywords`` is checked per value on "jobs", behind the
    router's "cvs" gate: without "cvs" it is the unknown-route 404, not the
    "jobs" 422."""
    fresh = await async_client.post('/applications', json=application_payload())
    assert fresh.status_code == 201
    path = f'/applications/{fresh.json()["id"]}/cv'
    body = {'base_cv_id': world['base_cv_id'], 'tailoring': 'keywords'}

    response = await async_client.post(path, json=body)
    assert response.status_code == 404
    assert response.json() == NOT_FOUND

    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    await unlist(db_session, JOBS_FEATURE_ID)
    response = await async_client.post(path, json=body)
    assert response.status_code == 422
    assert response.json() == {'detail': 'Unknown tailoring option'}

    await enrol(db_session, USER_ID, JOBS_FEATURE_ID)
    response = await async_client.post(path, json=body)
    assert response.status_code == 201, msg(201, response.text)


# ---------------------------------------------------------------------------
# R-008: the job board without "cvs" has no fit at all
# ---------------------------------------------------------------------------


async def test_job_list_without_cvs_has_no_fit(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    fitting = str(world['fitting_job'])
    without = (await async_client.get('/jobs')).json()
    assert {item['id'] for item in without['items']} >= {fitting}
    assert [item['best_fit'] for item in without['items']] == [None] * len(
        without['items']
    )

    # The control: listed, the same user has a stored fit of 100.
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    with_cvs = (await async_client.get('/jobs')).json()
    by_id = {item['id']: item for item in with_cvs['items']}
    assert by_id[fitting]['best_fit'] == {
        'base_cv_id': world['base_cv_id'],
        'score': 100,
    }
    # Nothing but the fit differs.
    for item in with_cvs['items']:
        item['best_fit'] = None
    assert with_cvs == without


async def test_min_fit_without_cvs_matches_no_job(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    response = await async_client.get('/jobs', params={'min_fit': 1})
    assert response.status_code == 200
    assert response.json() == {
        'items': [],
        'total': 0,
        'page': 1,
        'per_page': 25,
        'total_pages': 0,
    }

    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    listed = (await async_client.get('/jobs', params={'min_fit': 1})).json()
    assert [item['id'] for item in listed['items']] == [
        str(world['fitting_job'])
    ]


async def test_sort_by_fit_without_cvs_is_newest(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    def ids(page: dict) -> list[str]:
        return [item['id'] for item in page['items']]

    newest = (await async_client.get('/jobs', params={'sort': 'newest'})).json()
    by_fit = (await async_client.get('/jobs', params={'sort': 'fit'})).json()
    assert ids(by_fit) == ids(newest)
    assert ids(newest)[-1] == str(world['fitting_job'])

    # The control: with "cvs", fit puts the older fitting job first.
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    by_fit = (await async_client.get('/jobs', params={'sort': 'fit'})).json()
    assert ids(by_fit)[0] == str(world['fitting_job'])


async def test_job_detail_without_cvs_has_no_fit(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    path = f'/jobs/{world["fitting_job"]}'
    without = (await async_client.get(path)).json()
    assert without['fits'] == []
    assert without['best_fit'] is None

    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    listed = (await async_client.get(path)).json()
    assert [fit['score'] for fit in listed['fits']] == [100]
    assert listed['best_fit'] == {
        'base_cv_id': world['base_cv_id'],
        'score': 100,
    }


async def test_application_mark_is_unchanged_without_cvs(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    started = await async_client.post(
        '/applications/drafts/from-job',
        json={'job_id': str(world['start_job'])},
    )
    assert started.status_code == 201, msg(201, started.text)
    with_cvs = await async_client.get(f'/jobs/{world["start_job"]}')
    await unlist(db_session, CVS_FEATURE_ID)

    without = await async_client.get(f'/jobs/{world["start_job"]}')

    assert without.json()['application'] == with_cvs.json()['application']
    assert without.json()['application'] == {
        'id': started.json()['id'],
        'is_draft': True,
    }


# ---------------------------------------------------------------------------
# R-009: losing "cvs" keeps every CV and draft; applications keep working
# ---------------------------------------------------------------------------


async def test_losing_cvs_keeps_everything_and_gets_it_back_unchanged(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    reads = [
        '/base-cvs',
        f'/base-cvs/{world["base_cv_id"]}',
        f'/applications/{world["application_id"]}/cv',
        f'/applications/{world["draft_id"]}/cv',
        '/applications/drafts',
        f'/applications/drafts/{world["draft_id"]}',
    ]
    before = {path: (await async_client.get(path)).json() for path in reads}
    stored = await rows(db_session)

    await unlist(db_session, CVS_FEATURE_ID)
    assert await rows(db_session) == stored

    app_id = world['application_id']
    listed = await async_client.get('/applications')
    assert listed.status_code == 200
    assert app_id in [a['id'] for a in listed.json()]
    edited = await async_client.put(
        f'/applications/{app_id}',
        json=application_payload(role='Edited role'),
    )
    assert edited.status_code == 200, msg(200, edited.text)
    event = await async_client.post(
        f'/applications/{app_id}/timeline',
        json={'event_type': 'interview', 'event_date': '2025-12-02'},
    )
    assert event.status_code == 201, msg(201, event.text)
    timeline = await async_client.get(f'/applications/{app_id}/timeline')
    assert timeline.status_code == 200
    assert len(timeline.json()) == 1

    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    after = {path: (await async_client.get(path)).json() for path in reads}
    assert after == before
    after_rows = await rows(db_session)
    assert after_rows['base_cvs'] == stored['base_cvs']
    assert after_rows['tailored_cvs'] == stored['tailored_cvs']


# ---------------------------------------------------------------------------
# R-010: the worker keeps scoring every master CV
# ---------------------------------------------------------------------------


async def test_unlisted_users_master_cv_still_gets_fit_scores(
    async_engine: AsyncEngine, db_session: AsyncSession, world
):
    await db_session.execute(text('DELETE FROM job_fit_scores'))
    await db_session.commit()

    await recompute(async_engine, int(world['base_cv_id']))

    scored = await db_session.execute(
        text(
            'SELECT job_id, user_id, score FROM job_fit_scores '
            'WHERE base_cv_id = :id'
        ),
        {'id': int(world['base_cv_id'])},
    )
    assert {row.job_id: (row.user_id, row.score) for row in scored} == {
        world['fitting_job']: (USER_ID, 100),
        world['newer_job']: (USER_ID, 0),
        world['start_job']: (USER_ID, 0),
    }


def test_the_worker_and_the_job_use_cases_never_check_a_feature():
    root = Path(__file__).resolve().parents[2] / 'app'
    for folder in ('worker', 'application/use_cases/jobs'):
        for path in (root / folder).rglob('*.py'):
            assert 'require_feature' not in path.read_text(), path
            assert 'FeatureKey' not in path.read_text(), path


# ---------------------------------------------------------------------------
# The admin screen: cvs, its count and its migration-enrolled rows
# ---------------------------------------------------------------------------


async def test_admin_features_lists_cvs_with_its_beta_count(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await enrol(db_session, USER_ID, CVS_FEATURE_ID)
    async with as_admin():
        listing = await async_client.get('/admin/features')
        assert listing.status_code == 200
        by_key = {row['key']: row for row in listing.json()}
        assert by_key['cvs']['name'] == 'CV builder'
        assert by_key['cvs']['stage'] == 'beta'
        assert by_key['cvs']['beta_user_count'] == 1
        assert by_key['cvs']['me'] == {
            'has': True,
            'via': 'admin',
            'opted_out': False,
        }

        users = await async_client.get('/admin/features/cvs/users')
        assert users.status_code == 200
        items = users.json()['items']
        assert [item['user_id'] for item in items] == [str(USER_ID)]
        assert items[0]['added_by'] is None
