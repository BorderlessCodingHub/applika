"""The "jobs" beta gate against the testcontainers Postgres (KODI-052,
ADR-0018, T023; PRD 0013 R-002, R-003, R-005, R-012, R-013, R-015, R-016,
R-017, R-020..R-025, R-027, R-028).

The ``jobs`` row is inserted exactly as revision ``641001baff09`` seeds it
(``beta``, empty list, no opt-out) and nobody is enrolled unless a test says
so - so the ``async_client`` user starts without "jobs" and the seeded admin
starts with it. Every gated answer is compared byte for byte with the answer
to a route that does not exist.
"""

from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config.db import get_session
from app.core.tokens import create_access_token
from app.domain.models import FeatureModel, SavedJobSearchModel
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.features_seed import enrol, opt_out, seed_jobs_feature
from tests.integration.conftest import as_user
from tests.integration.jobs_seed import seed_sources
from tests.integration.test_jobs_api import add_job
from tests.integration.test_tailored_cv_api import (
    KEYWORDS_JOB_DESCRIPTION,
    application_payload,
    base_cv_payload,
)

USER_ID = base_data()['user'].id
ADMIN_ID = base_data()['admin_user'].id
NOT_FOUND = {'detail': 'Not Found'}
UNKNOWN_TAILORING = {'detail': 'Unknown tailoring option'}


def as_admin(is_admin: bool = True):
    return as_user(ADMIN_ID, 'adminuser', is_admin=is_admin)


def as_plain_user(is_admin: bool = False):
    return as_user(USER_ID, 'testuser', is_admin=is_admin)


@pytest_asyncio.fixture
async def jobs_feature(db_session: AsyncSession) -> int:
    """The ``jobs`` row as the migration seeds it - nobody listed."""
    return await seed_jobs_feature(db_session)


@pytest_asyncio.fixture
async def world(
    async_client: AsyncClient, db_session: AsyncSession, jobs_feature: int
) -> dict[str, Any]:
    """One of everything a gated route can name, owned by the
    ``async_client`` user: a listed job, a saved search, a master CV and an
    application with a verbatim CV copy and a job description."""
    await seed_sources(db_session)
    job_id = await add_job(db_session)
    search = SavedJobSearchModel(user_id=USER_ID, name='Mine', filters={})
    db_session.add(search)
    await db_session.commit()
    cv = await async_client.post('/base-cvs', json=base_cv_payload())
    assert cv.status_code == 201, msg(201, cv.text)
    application = await async_client.post(
        '/applications',
        json=application_payload(job_description=KEYWORDS_JOB_DESCRIPTION),
    )
    assert application.status_code == 201, msg(201, application.text)
    copy = await async_client.post(
        f'/applications/{application.json()["id"]}/cv',
        json={'base_cv_id': cv.json()['id']},
    )
    assert copy.status_code == 201, msg(201, copy.text)
    return {
        'feature_id': jobs_feature,
        'job_id': job_id,
        'search_id': search.id,
        'base_cv_id': cv.json()['id'],
        'application_id': application.json()['id'],
    }


def gated_calls(w: dict[str, Any]) -> list[tuple[str, str, dict | None]]:
    """Every route the "jobs" gate covers, with a well-formed request."""
    job, search, app = w['job_id'], w['search_id'], w['application_id']
    return [
        ('GET', '/jobs', None),
        ('GET', f'/jobs/{job}', None),
        ('PUT', f'/jobs/{job}/dismissal', None),
        ('DELETE', f'/jobs/{job}/dismissal', None),
        ('GET', '/job-searches', None),
        ('POST', '/job-searches', {'name': 'New', 'filters': {}}),
        ('PUT', f'/job-searches/{search}', {'name': 'Renamed'}),
        ('DELETE', f'/job-searches/{search}', None),
        ('POST', '/applications/drafts/from-job', {'job_id': str(job)}),
        ('GET', f'/applications/{app}/cv/fit', None),
    ]


async def call(
    client: AsyncClient, method: str, path: str, body: dict | None
) -> Response:
    if body is None:
        return await client.request(method, path)
    return await client.request(method, path, json=body)


async def unknown_route(client: AsyncClient) -> Response:
    response = await client.get('/no-such-route')
    assert response.status_code == 404
    return response


async def assert_hidden(client: AsyncClient, w: dict[str, Any]) -> None:
    """Every gated route answers exactly what an unknown route answers."""
    reference = await unknown_route(client)
    for method, path, body in gated_calls(w):
        response = await call(client, method, path, body)
        assert response.status_code == 404, msg(404, (method, path))
        assert response.content == reference.content, (method, path)
        assert response.json() == NOT_FOUND


async def assert_open(client: AsyncClient) -> None:
    response = await client.get('/jobs')
    assert response.status_code == 200, msg(200, response.text)


# ---------------------------------------------------------------------------
# R-020: an unlisted user - every gated route is an unknown route
# ---------------------------------------------------------------------------


async def test_unlisted_user_gets_the_unknown_route_404_on_every_gated_route(
    async_client: AsyncClient, world
):
    await assert_hidden(async_client, world)


async def test_nothing_is_written_through_a_hidden_route(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await assert_hidden(async_client, world)

    for table in ('job_dismissals', 'saved_job_searches'):
        count = await db_session.scalar(
            text(f'SELECT count(*) FROM {table} WHERE user_id = :id'),
            {'id': USER_ID},
        )
        assert count == (1 if table == 'saved_job_searches' else 0)
    renamed = await db_session.scalar(
        text('SELECT name FROM saved_job_searches WHERE id = :id'),
        {'id': world['search_id']},
    )
    assert renamed == 'Mine'
    drafts = await db_session.scalar(
        text('SELECT count(*) FROM applications WHERE job_id IS NOT NULL')
    )
    assert drafts == 0


async def test_the_same_routes_open_once_the_user_is_listed(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """The positive control: the 404s above are the gate, not missing
    rows - listed, every call reaches its handler."""
    await enrol(db_session, USER_ID)
    expected = [200, 200, 204, 204, 200, 201, 200, 204, 201, 200]
    for (method, path, body), status in zip(
        gated_calls(world), expected, strict=True
    ):
        response = await call(async_client, method, path, body)
        assert response.status_code == status, msg(
            status, (method, path, response.text)
        )


async def test_well_formed_json_with_wrong_fields_is_still_404(
    async_client: AsyncClient, world
):
    """Plan correction 5: the gate runs before field validation."""
    reference = await unknown_route(async_client)
    for path in (
        '/job-searches',
        '/applications/drafts/from-job',
    ):
        response = await async_client.post(path, json={'nope': 1})
        assert response.status_code == 404, msg(404, response.text)
        assert response.content == reference.content
    response = await async_client.put(
        f'/job-searches/{world["search_id"]}', json={'nope': 1}
    )
    assert response.content == reference.content
    response = await async_client.get('/jobs', params={'per_page': 1000})
    assert response.content == reference.content
    response = await async_client.get('/jobs/not-a-snowflake')
    assert response.content == reference.content


async def test_non_json_body_and_undefined_method_differ_as_documented(
    async_client: AsyncClient, world
):
    """Plan correction 5 (owner-approved): FastAPI decodes the body before
    any dependency, so a body that is not JSON is its 422 ``json_invalid``;
    Starlette answers an undefined method with 405. Recorded in the backend
    CLAUDE.md, not hidden."""
    response = await async_client.post(
        '/job-searches',
        content=b'{not json',
        headers={'content-type': 'application/json'},
    )
    assert response.status_code == 422
    assert response.json()['detail'][0]['type'] == 'json_invalid'
    assert (await async_client.patch('/jobs')).status_code == 405


async def test_anonymous_gets_todays_401_not_the_404(
    async_engine: AsyncEngine, world
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
            response = await call(client, method, path, body)
            assert response.status_code == 401, msg(401, (method, path))
            assert response.json() == {'detail': 'Not authenticated'}


# ---------------------------------------------------------------------------
# R-021: "keywords" is an unknown option without "jobs"; "copy" is untouched
# ---------------------------------------------------------------------------


async def _fresh_application(client: AsyncClient) -> str:
    response = await client.post(
        '/applications',
        json=application_payload(job_description=KEYWORDS_JOB_DESCRIPTION),
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()['id']


async def _copies(session: AsyncSession, application_id: str) -> int:
    return int(
        await session.scalar(
            text(
                'SELECT count(*) FROM tailored_cvs WHERE application_id = :id'
            ),
            {'id': int(application_id)},
        )
        or 0
    )


async def test_keywords_without_jobs_is_422_unknown_option_and_writes_nothing(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    app_id = await _fresh_application(async_client)

    response = await async_client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': world['base_cv_id'], 'tailoring': 'keywords'},
    )

    assert response.status_code == 422, msg(422, response.text)
    assert response.json() == UNKNOWN_TAILORING
    assert await _copies(db_session, app_id) == 0


@pytest.mark.parametrize('body', [{}, {'tailoring': 'copy'}])
async def test_copy_and_no_tailoring_work_without_jobs(
    async_client: AsyncClient, db_session: AsyncSession, world, body
):
    app_id = await _fresh_application(async_client)

    response = await async_client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': world['base_cv_id'], **body},
    )

    assert response.status_code == 201, msg(201, response.text)
    assert response.json()['adjustments'] == []
    assert await _copies(db_session, app_id) == 1


async def test_keywords_with_jobs_tailors(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await enrol(db_session, USER_ID)
    app_id = await _fresh_application(async_client)

    response = await async_client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': world['base_cv_id'], 'tailoring': 'keywords'},
    )

    assert response.status_code == 201, msg(201, response.text)
    assert response.json()['adjustments'] != []


# ---------------------------------------------------------------------------
# R-002, R-005, R-013, R-017, R-024: admins
# ---------------------------------------------------------------------------


async def test_admin_has_jobs_by_default_and_loses_it_with_an_opt_out(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    async with as_admin():
        await assert_open(async_client)

        await opt_out(db_session, ADMIN_ID)
        response = await async_client.get('/jobs')
        assert response.status_code == 404
        assert response.json() == NOT_FOUND

        await db_session.execute(text('DELETE FROM feature_admin_opt_outs'))
        await db_session.commit()
        await assert_open(async_client)


async def test_listed_admin_keeps_jobs_after_opting_out(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """R-017: the opt-out removes only the admin access."""
    await opt_out(db_session, ADMIN_ID)
    await enrol(db_session, ADMIN_ID)
    async with as_admin():
        await assert_open(async_client)


async def test_admin_job_sources_stay_open_to_an_opted_out_admin(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """R-024: the admin job-source screen is never gated."""
    await opt_out(db_session, ADMIN_ID)
    async with as_admin():
        assert (await async_client.get('/jobs')).status_code == 404
        response = await async_client.get('/admin/jobs/sources')
        assert response.status_code == 200, msg(200, response.text)
        assert {s['code'] for s in response.json()} == {
            'himalayas',
            'remoteok',
        }


async def test_one_admins_opt_out_leaves_another_admin_alone(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """R-014: the opt-out is per admin. User 1 made an admin stands in for
    a second admin."""
    await opt_out(db_session, ADMIN_ID)
    async with as_plain_user(is_admin=True):
        await assert_open(async_client)


# ---------------------------------------------------------------------------
# R-011, R-016: the stage
# ---------------------------------------------------------------------------


async def _set_stage(session: AsyncSession, stage: str) -> None:
    await session.execute(
        text('UPDATE features SET stage = :stage WHERE key = :key'),
        {'stage': stage, 'key': 'jobs'},
    )
    await session.commit()


async def test_general_opens_to_everyone_and_beta_hides_again(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await opt_out(db_session, ADMIN_ID)

    await _set_stage(db_session, 'general')
    await assert_open(async_client)
    async with as_admin():
        await assert_open(async_client)

    await _set_stage(db_session, 'beta')
    await assert_hidden(async_client, world)
    async with as_admin():
        assert (await async_client.get('/jobs')).status_code == 404


async def test_general_lets_keywords_through_without_a_list_row(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await _set_stage(db_session, 'general')
    app_id = await _fresh_application(async_client)

    response = await async_client.post(
        f'/applications/{app_id}/cv',
        json={'base_cv_id': world['base_cv_id'], 'tailoring': 'keywords'},
    )

    assert response.status_code == 201, msg(201, response.text)


# ---------------------------------------------------------------------------
# R-002, R-003: nothing else gives a feature
# ---------------------------------------------------------------------------


async def test_ex_admin_with_an_old_opt_out_has_only_the_list(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await opt_out(db_session, USER_ID)
    async with as_plain_user(is_admin=False):
        assert (await async_client.get('/jobs')).status_code == 404
        await enrol(db_session, USER_ID)
        await assert_open(async_client)


async def test_an_unknown_key_is_hidden_from_admins_too(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """R-003: no ``jobs`` row at all - fail closed, even for an admin."""
    await db_session.execute(text("DELETE FROM features WHERE key = 'jobs'"))
    await db_session.commit()
    async with as_admin():
        response = await async_client.get('/jobs')
        assert response.status_code == 404
        assert response.json() == NOT_FOUND


async def test_user_made_admin_has_jobs_on_the_next_request(
    async_engine: AsyncEngine, db_session: AsyncSession, world
):
    """R-012: ``is_admin`` is read from the database on every request (the
    real cookie path, no ``get_current_user`` override) and nothing is
    cached, so a change applies on the very next request."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with maker() as session:
            yield session

    main_app.dependency_overrides.clear()
    main_app.dependency_overrides[get_session] = override_get_session
    token, _, _ = create_access_token(str(base_data()['user'].github_id))
    async with AsyncClient(
        transport=ASGITransport(app=main_app), base_url='http://test/api'
    ) as client:
        client.cookies.set('__access', token)
        assert (await client.get('/jobs')).status_code == 404

        await db_session.execute(
            text('UPDATE users SET is_admin = true WHERE id = :id'),
            {'id': USER_ID},
        )
        await db_session.commit()
        assert (await client.get('/jobs')).status_code == 200

        await db_session.execute(
            text('UPDATE users SET is_admin = false WHERE id = :id'),
            {'id': USER_ID},
        )
        await db_session.commit()
        assert (await client.get('/jobs')).status_code == 404

        await enrol(db_session, USER_ID)
        assert (await client.get('/jobs')).status_code == 200


# ---------------------------------------------------------------------------
# R-023: the worker and the fit recompute are never gated
# ---------------------------------------------------------------------------


async def test_unlisted_users_master_cv_still_enqueues_the_fit_recompute(
    async_client: AsyncClient, job_queue, world
):
    created = await async_client.post(
        '/base-cvs', json=base_cv_payload(name='Second')
    )
    assert created.status_code == 201, msg(201, created.text)
    assert int(created.json()['id']) in job_queue.recomputes
    assert int(world['base_cv_id']) in job_queue.recomputes


def test_the_worker_and_the_job_use_cases_never_import_the_gate():
    root = Path(__file__).resolve().parents[2] / 'app'
    for folder in ('worker', 'application/use_cases/jobs'):
        for path in (root / folder).rglob('*.py'):
            assert 'require_feature' not in path.read_text(), path


# ---------------------------------------------------------------------------
# R-027, R-019: losing "jobs" keeps everything made with it
# ---------------------------------------------------------------------------


async def test_losing_jobs_keeps_drafts_copies_searches_and_dismissals(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    await enrol(db_session, USER_ID)
    keyword_job = await add_job(
        db_session, description_text=KEYWORDS_JOB_DESCRIPTION
    )
    started = await async_client.post(
        '/applications/drafts/from-job',
        json={
            'job_id': str(keyword_job),
            'base_cv_id': world['base_cv_id'],
            'tailoring': 'keywords',
        },
    )
    assert started.status_code == 201, msg(201, started.text)
    draft = started.json()
    dismissed = await async_client.put(f'/jobs/{world["job_id"]}/dismissal')
    assert dismissed.status_code == 204
    searches_before = (await async_client.get('/job-searches')).json()
    marks_before = (
        await async_client.get('/jobs', params={'include_dismissed': True})
    ).json()['items']

    # Off the list: the job controls go, the work stays usable.
    await db_session.execute(text('DELETE FROM feature_beta_users'))
    await db_session.commit()
    assert (await async_client.get('/job-searches')).status_code == 404

    drafts = (await async_client.get('/applications/drafts')).json()
    assert draft['id'] in [d['id'] for d in drafts]
    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.status_code == 200
    assert fetched.json()['job_id'] == str(keyword_job)
    copy = await async_client.get(f'/applications/{draft["id"]}/cv')
    assert copy.status_code == 200
    assert copy.json()['adjustments'] != []
    body = {
        'company_name': 'Acme Corp',
        'role': 'Edited role',
        'platform_id': base_data()['plat_linkedin'].id,
    }
    updated = await async_client.put(
        f'/applications/drafts/{draft["id"]}', json=body
    )
    assert updated.status_code == 200, msg(200, updated.text)
    finished = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish'
    )
    assert finished.status_code == 200, msg(200, finished.text)
    listed = (await async_client.get('/applications')).json()
    assert draft['id'] in [a['id'] for a in listed]
    for table in ('saved_job_searches', 'job_dismissals'):
        count = await db_session.scalar(
            text(f'SELECT count(*) FROM {table} WHERE user_id = :id'),
            {'id': USER_ID},
        )
        assert count == 1, msg(f'1 row in {table}', count)

    # Back on the list: searches, dismissals and marks come back unchanged.
    await enrol(db_session, USER_ID)
    assert (await async_client.get('/job-searches')).json() == searches_before
    marks_after = (
        await async_client.get('/jobs', params={'include_dismissed': True})
    ).json()['items']
    assert [(m['id'], m['dismissed']) for m in marks_after] == [
        (m['id'], m['dismissed']) for m in marks_before
    ]
    assert any(m['dismissed'] for m in marks_after)
    by_id = {m['id']: m for m in marks_after}
    assert by_id[str(keyword_job)]['application'] == {
        'id': draft['id'],
        'is_draft': False,
    }


async def test_another_feature_never_grants_jobs(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """R-002: the check is per key - a released feature ``alpha`` the user
    has gives nothing on ``jobs``."""
    db_session.add(
        FeatureModel(
            id=8300000000000000011, key='alpha', name='A', stage='general'
        )
    )
    await db_session.commit()
    assert await my_keys(async_client) == ['alpha']
    response = await async_client.get('/jobs')
    assert response.status_code == 404
    assert response.json() == NOT_FOUND


async def test_a_missing_key_is_hidden_from_admins_while_others_exist(
    async_client: AsyncClient, db_session: AsyncSession, world
):
    """R-003: no ``jobs`` row while another (general) feature exists - an
    admin still gets the unknown-route 404 (code shipped before its seed
    row)."""
    db_session.add(
        FeatureModel(
            id=8300000000000000012, key='alpha', name='A', stage='general'
        )
    )
    await db_session.execute(text("DELETE FROM features WHERE key = 'jobs'"))
    await db_session.commit()
    async with as_admin():
        assert await my_keys(async_client) == ['alpha']
        response = await async_client.get('/jobs')
        assert response.status_code == 404
        assert response.json() == NOT_FOUND


async def my_keys(client: AsyncClient) -> list[str]:
    response = await client.get('/users/me/features')
    assert response.status_code == 200
    return [f['key'] for f in response.json()['features']]


async def test_trailing_slash_redirect_is_documented_not_hidden(
    async_client: AsyncClient, world
):
    """Starlette redirects ``/jobs/`` to ``/jobs`` (307) before any
    dependency runs, while an unknown route with a slash is 404 - recorded
    in the backend CLAUDE.md next to plan correction 5."""
    response = await async_client.get('/jobs/', follow_redirects=False)
    assert response.status_code == 307
    followed = await async_client.get('/jobs/', follow_redirects=True)
    assert followed.status_code == 404
    assert followed.json() == NOT_FOUND
