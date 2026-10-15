"""Integration tests for ``/applications/drafts`` - the "new application
with CV" flow (KODI-032, ADR-0014, backend half of KODI-033's UI).

Covers, by acceptance criterion:

* #2 - no application date is asked; finish takes the caller's own day,
  refused past ``UTC today + 1``.
* #3/#4 - step 2 (the CV copy) behaves exactly as ``PRD 0007``'s page:
  every ``/applications/{id}/cv*`` route accepts a draft id, and a PUT on
  the draft's own data never touches the copy.
* #7/#8 - finish requires a CV copy, then the draft becomes a normal
  application: it appears in ``GET /applications``, keeps its copy, and its
  date is what was submitted.
* #9 - ``GET /applications/drafts`` lists ``DraftSummary`` rows,
  ``updated_at`` desc, ``[]`` when there are none.
* #11 - DELETE removes the draft and its copy.
* #14 - a draft has no timeline and cannot be closed/reopened/edited
  through the ordinary application routes.
* #15/#16 - company resolution: id wins, name-only stays free text, an
  invisible company/platform is 404 and writes nothing.
* #6 backend half - two PUTs, last one wins.

KODI-036 (AC1 server half): a POST without ``application_date`` defaults to
the server's own day; a given date is stored and returned; a PUT that omits
the key or sends it explicit ``null`` keeps the stored value, never clears;
a date beyond ``UTC today + 1`` is a 422 on create and update, and nothing
is saved. ``POST .../finish`` accepts no body, ``{}`` or
``{application_date}``: the body date wins when given, else the draft's own
stored date is used, still refused in the future.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)

from app.config.db import get_session
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.integration.conftest import as_user
from tests.integration.test_tailored_cv_api import (
    base_cv_payload,
    update_payload,
)


def draft_payload(**overrides: Any) -> dict:
    payload: dict[str, Any] = {
        'company': base_data()['company_acme'].id,
        'company_id': base_data()['company_acme'].id,
        'company_name': 'Acme Corp',
        'role': 'Software Engineer',
        'platform_id': base_data()['plat_linkedin'].id,
    }
    payload.pop('company', None)
    payload.update(overrides)
    return payload


async def _create_draft(client: AsyncClient, **overrides: Any) -> dict:
    response = await client.post(
        '/applications/drafts', json=draft_payload(**overrides)
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def _create_base_cv(client: AsyncClient, **overrides: Any) -> dict:
    response = await client.post('/base-cvs', json=base_cv_payload(**overrides))
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def _attach_cv(
    client: AsyncClient, draft_id: str, base_cv_id: str
) -> dict:
    response = await client.post(
        f'/applications/{draft_id}/cv', json={'base_cv_id': base_cv_id}
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


@pytest_asyncio.fixture
async def raw_client(async_engine: AsyncEngine):
    """No auth override at all - the real 401 path (mirrors
    ``test_admin_discord_webhooks.raw_client``)."""
    SessionLocal = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with SessionLocal() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=main_app)
    async with AsyncClient(
        transport=transport, base_url='http://test/api'
    ) as client:
        yield client

    main_app.dependency_overrides.pop(get_session, None)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def test_create_draft_has_cv_false(async_client: AsyncClient):
    draft = await _create_draft(async_client)
    assert draft['has_cv'] is False, msg(False, draft['has_cv'])
    assert draft['company_id'] == str(base_data()['company_acme'].id)
    assert draft['mode'] == 'active'


# ---------------------------------------------------------------------------
# application_date (KODI-036, R-003, AC1 server half)
# ---------------------------------------------------------------------------


async def test_create_draft_without_date_defaults_to_server_today(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client)
    assert draft['application_date'] == date.today().isoformat()


async def test_create_draft_with_date_stores_it(async_client: AsyncClient):
    given = '2026-01-02'
    draft = await _create_draft(async_client, application_date=given)
    assert draft['application_date'] == given

    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['application_date'] == given


async def test_create_draft_future_date_is_422_and_writes_nothing(
    async_client: AsyncClient,
):
    too_far = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    response = await async_client.post(
        '/applications/drafts',
        json=draft_payload(application_date=too_far),
    )
    assert response.status_code == 422, msg(422, response.status_code)

    listed = await async_client.get('/applications/drafts')
    assert listed.json() == [], msg([], listed.json())


async def test_update_draft_without_date_key_keeps_stored_value(
    async_client: AsyncClient,
):
    given = '2026-01-02'
    draft = await _create_draft(async_client, application_date=given)

    payload = draft_payload(role='Touched')
    payload.pop('application_date', None)
    response = await async_client.put(
        f'/applications/drafts/{draft["id"]}', json=payload
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == given


async def test_update_draft_explicit_null_date_keeps_stored_value(
    async_client: AsyncClient,
):
    given = '2026-01-02'
    draft = await _create_draft(async_client, application_date=given)

    response = await async_client.put(
        f'/applications/drafts/{draft["id"]}',
        json=draft_payload(application_date=None),
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == given


async def test_update_draft_with_date_overwrites_stored_value(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client, application_date='2026-01-02')

    response = await async_client.put(
        f'/applications/drafts/{draft["id"]}',
        json=draft_payload(application_date='2026-02-10'),
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == '2026-02-10'


async def test_update_draft_future_date_is_422_and_writes_nothing(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client, application_date='2026-01-02')
    too_far = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()

    response = await async_client.put(
        f'/applications/drafts/{draft["id"]}',
        json=draft_payload(application_date=too_far),
    )
    assert response.status_code == 422, msg(422, response.status_code)

    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['application_date'] == '2026-01-02'


async def test_create_draft_name_only_company_stays_free_text(
    async_client: AsyncClient,
):
    draft = await _create_draft(
        async_client, company_id=None, company_name='Stealth Startup'
    )
    assert draft['company_id'] is None
    assert draft['company_name'] == 'Stealth Startup'


async def test_create_draft_foreign_company_is_404_and_writes_nothing(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications/drafts',
        json=draft_payload(company_id=999_999, company_name='Nope'),
    )
    assert response.status_code == 404, msg(404, response.status_code)

    listed = await async_client.get('/applications/drafts')
    assert listed.json() == [], msg([], listed.json())


async def test_create_draft_foreign_platform_is_404_and_writes_nothing(
    async_client: AsyncClient,
):
    response = await async_client.post(
        '/applications/drafts', json=draft_payload(platform_id=999_999)
    )
    assert response.status_code == 404, msg(404, response.status_code)

    listed = await async_client.get('/applications/drafts')
    assert listed.json() == [], msg([], listed.json())


async def test_create_draft_anon_is_401(raw_client: AsyncClient):
    response = await raw_client.post(
        '/applications/drafts', json=draft_payload()
    )
    assert response.status_code == 401, msg(401, response.status_code)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


async def test_list_drafts_empty_is_empty_list(async_client: AsyncClient):
    response = await async_client.get('/applications/drafts')
    assert response.status_code == 200
    assert response.json() == []


async def test_list_drafts_fields_and_updated_at_desc_order(
    async_client: AsyncClient,
):
    older = await _create_draft(async_client, role='First Draft')
    newer = await _create_draft(async_client, role='Second Draft')

    # Touching the older draft bumps its updated_at past the newer one's -
    # updated_at desc means it now sorts first.
    response = await async_client.put(
        f'/applications/drafts/{older["id"]}',
        json=draft_payload(role='Touched'),
    )
    assert response.status_code == 200

    listed = await async_client.get('/applications/drafts')
    assert listed.status_code == 200
    ids = [row['id'] for row in listed.json()]
    assert ids == [older['id'], newer['id']], msg(
        [older['id'], newer['id']], ids
    )
    assert listed.json()[0]['role'] == 'Touched'
    row = listed.json()[0]
    assert set(row.keys()) == {
        'id',
        'created_at',
        'updated_at',
        'company_name',
        'role',
        'platform_id',
        'has_cv',
    }


# ---------------------------------------------------------------------------
# Update - full replace, keeps the CV copy
# ---------------------------------------------------------------------------


async def test_update_draft_two_puts_last_wins(async_client: AsyncClient):
    draft = await _create_draft(async_client, role='First')
    await async_client.put(
        f'/applications/drafts/{draft["id"]}', json=draft_payload(role='Second')
    )
    response = await async_client.put(
        f'/applications/drafts/{draft["id"]}', json=draft_payload(role='Third')
    )
    assert response.status_code == 200
    assert response.json()['role'] == 'Third'

    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['role'] == 'Third'


async def test_update_draft_keeps_cv_copy(async_client: AsyncClient):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    response = await async_client.put(
        f'/applications/drafts/{draft["id"]}',
        json=draft_payload(role='Changed My Mind'),
    )
    assert response.status_code == 200
    assert response.json()['has_cv'] is True

    cv = await async_client.get(f'/applications/{draft["id"]}/cv')
    assert cv.status_code == 200


async def test_update_foreign_draft_is_404(async_client: AsyncClient):
    draft = await _create_draft(async_client)
    async with as_user(
        base_data()['admin_user'].id, 'adminuser', is_admin=True
    ):
        response = await async_client.put(
            f'/applications/drafts/{draft["id"]}', json=draft_payload()
        )
    assert response.status_code == 404, msg(404, response.status_code)


# ---------------------------------------------------------------------------
# The CV copy on a draft (PRD 0007's page, step 2)
# ---------------------------------------------------------------------------


async def test_draft_cv_copy_full_round_trip(async_client: AsyncClient):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)

    created = await _attach_cv(async_client, draft['id'], base_cv['id'])
    assert created['full_name'] == base_cv['full_name']

    got = await async_client.get(f'/applications/{draft["id"]}/cv')
    assert got.status_code == 200, msg(200, got.status_code)

    markdown = await async_client.get(
        f'/applications/{draft["id"]}/cv/markdown'
    )
    assert markdown.status_code == 200, msg(200, markdown.status_code)

    pdf = await async_client.post(f'/applications/{draft["id"]}/cv/pdf')
    assert pdf.status_code == 200, msg(200, pdf.status_code)
    assert pdf.content.startswith(b'%PDF-')

    updated = await async_client.put(
        f'/applications/{draft["id"]}/cv', json=update_payload()
    )
    assert updated.status_code == 200, msg(200, updated.text)
    assert updated.json()['summary'] == update_payload()['summary']

    diff_markdown = await async_client.get(
        f'/applications/{draft["id"]}/cv/diff/markdown'
    )
    assert diff_markdown.status_code == 200, msg(200, diff_markdown.text)

    diff_pdf = await async_client.get(
        f'/applications/{draft["id"]}/cv/diff/pdf'
    )
    assert diff_pdf.status_code == 200, msg(200, diff_pdf.status_code)
    assert diff_pdf.content.startswith(b'%PDF-')

    deleted = await async_client.delete(f'/applications/{draft["id"]}/cv')
    assert deleted.status_code == 204, msg(204, deleted.status_code)

    other_master = await _create_base_cv(async_client, name='Other Master')
    recreated = await _attach_cv(async_client, draft['id'], other_master['id'])
    assert recreated['full_name'] == other_master['full_name']


async def test_draft_cv_copy_outlives_deleted_master(async_client: AsyncClient):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    delete_master = await async_client.delete(f'/base-cvs/{base_cv["id"]}')
    assert delete_master.status_code == 204

    copy = await async_client.get(f'/applications/{draft["id"]}/cv')
    assert copy.status_code == 200
    assert copy.json()['base_cv_id'] is None


# ---------------------------------------------------------------------------
# Finish
# ---------------------------------------------------------------------------


async def test_finish_draft_without_cv_copy_is_422(async_client: AsyncClient):
    draft = await _create_draft(async_client)
    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish',
        json={'application_date': datetime.now(UTC).date().isoformat()},
    )
    assert response.status_code == 422, msg(422, response.status_code)
    assert 'Pick a master CV' in response.json()['detail']


async def test_finish_draft_date_beyond_utc_plus_one_is_422(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    too_far = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish',
        json={'application_date': too_far},
    )
    assert response.status_code == 422, msg(422, response.status_code)


async def test_finish_draft_no_body_uses_stored_date(async_client: AsyncClient):
    given = '2026-01-02'
    draft = await _create_draft(async_client, application_date=given)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish'
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == given


async def test_finish_draft_empty_body_uses_stored_date(
    async_client: AsyncClient,
):
    given = '2026-01-02'
    draft = await _create_draft(async_client, application_date=given)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish', json={}
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == given


async def test_finish_draft_body_date_overrides_stored_value(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client, application_date='2026-01-02')
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish',
        json={'application_date': '2026-01-20'},
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == '2026-01-20'


async def test_finish_draft_created_without_date_uses_creation_day(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish'
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == date.today().isoformat()


async def test_finish_draft_appears_in_applications_with_copy_and_date(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    before_stats = (await async_client.get('/applications/statistics')).json()

    finish_date = datetime.now(UTC).date().isoformat()
    response = await async_client.post(
        f'/applications/drafts/{draft["id"]}/finish',
        json={'application_date': finish_date},
    )
    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['application_date'] == finish_date

    listed = await async_client.get('/applications')
    ids = [row['id'] for row in listed.json()]
    assert draft['id'] in ids, msg(draft['id'], ids)

    cv = await async_client.get(f'/applications/{draft["id"]}/cv')
    assert cv.status_code == 200

    drafts = await async_client.get('/applications/drafts')
    assert draft['id'] not in [row['id'] for row in drafts.json()]

    # #8: it counts in statistics from the moment it is finished.
    after_stats = (await async_client.get('/applications/statistics')).json()
    assert (
        after_stats['total_applications']
        == before_stats['total_applications'] + 1
    ), msg(
        before_stats['total_applications'] + 1,
        after_stats['total_applications'],
    )


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_draft_removes_it_and_its_cv_copy(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client)
    base_cv = await _create_base_cv(async_client)
    await _attach_cv(async_client, draft['id'], base_cv['id'])

    response = await async_client.delete(f'/applications/drafts/{draft["id"]}')
    assert response.status_code == 204, msg(204, response.status_code)

    get_after = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert get_after.status_code == 404

    cv_after = await async_client.get(f'/applications/{draft["id"]}/cv')
    assert cv_after.status_code == 404


# ---------------------------------------------------------------------------
# Isolation from the ordinary application routes and from other users
# ---------------------------------------------------------------------------


async def test_draft_id_404_on_ordinary_application_routes(
    async_client: AsyncClient,
):
    draft = await _create_draft(async_client)
    draft_id = draft['id']

    put_resp = await async_client.put(
        f'/applications/{draft_id}',
        json={
            'company': base_data()['company_acme'].id,
            'role': 'X',
            'mode': 'active',
            'platform_id': base_data()['plat_linkedin'].id,
            'application_date': '2026-01-01',
        },
    )
    assert put_resp.status_code == 404, msg(404, put_resp.status_code)

    delete_resp = await async_client.delete(f'/applications/{draft_id}')
    assert delete_resp.status_code == 404, msg(404, delete_resp.status_code)

    timeline_resp = await async_client.get(f'/applications/{draft_id}/timeline')
    assert timeline_resp.status_code == 404, msg(404, timeline_resp.status_code)

    steps_resp = await async_client.get(f'/applications/{draft_id}/steps')
    assert steps_resp.status_code == 404, msg(404, steps_resp.status_code)

    finalize_resp = await async_client.post(
        f'/applications/{draft_id}/finalize'
    )
    assert finalize_resp.status_code == 404, msg(404, finalize_resp.status_code)

    reopen_resp = await async_client.post(f'/applications/{draft_id}/reopen')
    assert reopen_resp.status_code == 404, msg(404, reopen_resp.status_code)


async def test_finished_application_id_404_on_draft_routes(
    async_client: AsyncClient,
):
    create_resp = await async_client.post(
        '/applications',
        json={
            'company': base_data()['company_acme'].id,
            'role': 'Ordinary',
            'mode': 'active',
            'platform_id': base_data()['plat_linkedin'].id,
            'application_date': '2026-01-01',
        },
    )
    assert create_resp.status_code == 201
    application_id = create_resp.json()['id']

    get_resp = await async_client.get(f'/applications/drafts/{application_id}')
    assert get_resp.status_code == 404, msg(404, get_resp.status_code)

    put_resp = await async_client.put(
        f'/applications/drafts/{application_id}', json=draft_payload()
    )
    assert put_resp.status_code == 404, msg(404, put_resp.status_code)

    delete_resp = await async_client.delete(
        f'/applications/drafts/{application_id}'
    )
    assert delete_resp.status_code == 404, msg(404, delete_resp.status_code)

    finish_resp = await async_client.post(
        f'/applications/drafts/{application_id}/finish',
        json={'application_date': '2026-01-01'},
    )
    assert finish_resp.status_code == 404, msg(404, finish_resp.status_code)


async def test_foreign_draft_is_404_on_every_route(async_client: AsyncClient):
    draft = await _create_draft(async_client)

    async with as_user(
        base_data()['admin_user'].id, 'adminuser', is_admin=True
    ):
        get_resp = await async_client.get(f'/applications/drafts/{draft["id"]}')
        assert get_resp.status_code == 404

        put_resp = await async_client.put(
            f'/applications/drafts/{draft["id"]}', json=draft_payload()
        )
        assert put_resp.status_code == 404

        delete_resp = await async_client.delete(
            f'/applications/drafts/{draft["id"]}'
        )
        assert delete_resp.status_code == 404

        finish_resp = await async_client.post(
            f'/applications/drafts/{draft["id"]}/finish',
            json={'application_date': '2026-01-01'},
        )
        assert finish_resp.status_code == 404

        cv_resp = await async_client.get(f'/applications/{draft["id"]}/cv')
        assert cv_resp.status_code == 404


# ---------------------------------------------------------------------------
# KODI-047: job_id on the draft shape
# ---------------------------------------------------------------------------


async def test_ordinary_draft_has_null_job_id(async_client: AsyncClient):
    draft = await _create_draft(async_client)

    assert draft['job_id'] is None
    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['job_id'] is None


@pytest.mark.usefixtures('jobs_beta')  # KODI-052: needs "jobs"
async def test_put_keeps_a_from_job_drafts_job_id_and_cannot_set_it(
    async_client: AsyncClient, db_session: AsyncSession
):
    from tests.integration.jobs_seed import seed_sources
    from tests.integration.test_jobs_api import add_job

    await seed_sources(db_session)
    job_id = await add_job(db_session)
    created = await async_client.post(
        '/applications/drafts/from-job', json={'job_id': str(job_id)}
    )
    assert created.status_code == 201, msg(201, created.text)
    draft = created.json()

    put = await async_client.put(
        f'/applications/drafts/{draft["id"]}',
        json=draft_payload(role='Edited role'),
    )
    assert put.status_code == 200, msg(200, put.text)
    assert put.json()['role'] == 'Edited role'
    assert put.json()['job_id'] == str(job_id)

    # job_id is not part of the input: a PUT naming it is refused.
    refused = await async_client.put(
        f'/applications/drafts/{draft["id"]}',
        json=draft_payload(job_id=None),
    )
    assert refused.status_code == 422, msg(422, refused.text)
    fetched = await async_client.get(f'/applications/drafts/{draft["id"]}')
    assert fetched.json()['job_id'] == str(job_id)
