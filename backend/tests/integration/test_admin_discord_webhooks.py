"""Integration tests for /admin/discord-webhooks (KODI-025, T121).

Covers AC1 (list/add/change/remove, address + server id + optional role
ids), AC2 (format validation), AC3 (masked address only, never the full
URL), 401/403/404/409/422 and the "token segment never in any response
body" guard the orchestrator flagged (FastAPI's default 422 echoes the
whole submitted body for a missing field).
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config.db import get_session
from app.main import app as main_app
from tests import msg

VALID_ID = '123456789012345678'
VALID_TOKEN = 'AbCdEfGhIjKlMnOpQrSt0123456789'
VALID_URL = f'https://discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}'

OTHER_ID = '223456789012345678'
OTHER_TOKEN = 'ZzYyXxWwVvUuTtSsRrQq9876543210'
OTHER_URL = f'https://discord.com/api/webhooks/{OTHER_ID}/{OTHER_TOKEN}'

GUILD_ID = '333456789012345678'
GUILD_ID_2 = '443456789012345678'
ROLE_ID_1 = '553456789012345678'
ROLE_ID_2 = '663456789012345678'


@pytest_asyncio.fixture
async def raw_client(async_engine):
    """No auth override at all - the real 401 path."""
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


def _create_payload(**overrides):
    payload = {
        'webhook_url': VALID_URL,
        'guild_id': GUILD_ID,
        'role_ids': [ROLE_ID_1, ROLE_ID_2],
        'label': 'Community reports',
    }
    payload.update(overrides)
    return payload


# ── Access control ───────────────────────────────────────────────


async def test_unauthenticated_is_401(
    raw_client: AsyncClient, db_session: AsyncSession
):
    resp = await raw_client.get('/admin/discord-webhooks')
    assert resp.status_code == 401, msg(401, resp.status_code)


async def test_non_admin_get_is_403(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.get('/admin/discord-webhooks')
    assert resp.status_code == 403, msg(403, resp.status_code)
    assert resp.json() == {'detail': 'Admin access required'}


async def test_non_admin_post_is_403(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    assert resp.status_code == 403, msg(403, resp.status_code)


async def test_non_admin_patch_is_403(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.patch(
        '/admin/discord-webhooks/9999', json={'label': 'x'}
    )
    assert resp.status_code == 403, msg(403, resp.status_code)


async def test_non_admin_delete_is_403(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.delete('/admin/discord-webhooks/9999')
    assert resp.status_code == 403, msg(403, resp.status_code)


# ── CRUD happy path (AC1) ────────────────────────────────────────


async def test_admin_can_create_list_update_and_delete_a_webhook(
    admin_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    assert create_resp.status_code == 201, msg(201, create_resp.status_code)
    created = create_resp.json()
    assert created['guild_id'] == GUILD_ID
    assert set(created['role_ids']) == {ROLE_ID_1, ROLE_ID_2}
    assert created['label'] == 'Community reports'
    assert 'webhook_url' not in created
    assert created['webhook_url_masked'] == (
        f'https://discord.com/api/webhooks/{VALID_ID}/…{VALID_TOKEN[-4:]}'
    )
    webhook_id = created['id']

    list_resp = await admin_client.get('/admin/discord-webhooks')
    assert list_resp.status_code == 200, msg(200, list_resp.status_code)
    rows = list_resp.json()
    assert any(row['id'] == webhook_id for row in rows)
    for row in rows:
        assert 'webhook_url' not in row

    update_resp = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'label': 'Updated label', 'role_ids': [ROLE_ID_1]},
    )
    assert update_resp.status_code == 200, msg(200, update_resp.status_code)
    updated = update_resp.json()
    assert updated['label'] == 'Updated label'
    assert updated['role_ids'] == [ROLE_ID_1]
    # unrelated fields are untouched by the partial update
    assert updated['guild_id'] == GUILD_ID
    assert updated['webhook_url_masked'] == created['webhook_url_masked']

    delete_resp = await admin_client.delete(
        f'/admin/discord-webhooks/{webhook_id}'
    )
    assert delete_resp.status_code == 204, msg(204, delete_resp.status_code)

    get_after_delete = await admin_client.get('/admin/discord-webhooks')
    assert all(row['id'] != webhook_id for row in get_after_delete.json())


async def test_create_with_no_role_ids_defaults_to_empty_list(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        json={'webhook_url': VALID_URL, 'guild_id': GUILD_ID},
    )
    assert resp.status_code == 201, msg(201, resp.status_code)
    assert resp.json()['role_ids'] == []
    assert resp.json()['label'] is None


# ── AC2: format validation (422) ─────────────────────────────────


async def test_create_with_invalid_url_is_422(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(webhook_url='https://evil.example.com/x'),
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    assert resp.json() == {'detail': 'Invalid Discord webhook URL'}


async def test_create_with_missing_guild_id_is_422_and_never_leaks_the_url(
    admin_client: AsyncClient, db_session: AsyncSession
):
    payload = {'webhook_url': VALID_URL}
    resp = await admin_client.post('/admin/discord-webhooks', json=payload)
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert VALID_URL not in body_text
    assert VALID_TOKEN not in body_text
    assert resp.json() == {'detail': 'Invalid Discord server id'}


async def test_create_with_bad_guild_id_is_422_and_never_leaks_the_url(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(guild_id='not-a-snowflake'),
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert VALID_URL not in body_text
    assert VALID_TOKEN not in body_text


async def test_create_with_26_roles_is_422_and_never_leaks_the_url(
    admin_client: AsyncClient, db_session: AsyncSession
):
    role_ids = [str(700000000000000000 + i) for i in range(26)]
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(role_ids=role_ids),
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert VALID_URL not in body_text
    assert VALID_TOKEN not in body_text
    assert resp.json() == {'detail': 'A webhook may hold at most 25 role ids'}


async def test_create_with_url_as_a_list_never_leaks_it_in_the_422_body(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """backend-qa finding B3: a type-mismatch error's ``input`` is the
    caller's own bad value - here that value directly contains the URL."""
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(webhook_url=[VALID_URL]),
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert VALID_URL not in body_text
    assert VALID_TOKEN not in body_text


async def test_patch_with_url_as_a_list_never_leaks_it_in_the_422_body(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    webhook_id = created.json()['id']

    resp = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'webhook_url': [OTHER_URL]},
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert OTHER_URL not in body_text
    assert OTHER_TOKEN not in body_text


async def test_create_with_form_encoded_body_never_leaks_the_url(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """A form-encoded body fails pydantic's JSON decode; the raw body,
    ``webhook_url`` included, must not surface in the 422."""
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        content=f'webhook_url={VALID_URL}&guild_id={GUILD_ID}',
        headers={'content-type': 'application/x-www-form-urlencoded'},
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert VALID_URL not in body_text
    assert VALID_TOKEN not in body_text


async def test_create_with_json_string_body_never_leaks_the_url(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """A bare JSON string (not an object) also fails to validate; the
    string itself - which could be attacker-supplied and contain the URL -
    must not surface in the 422."""
    resp = await admin_client.post(
        '/admin/discord-webhooks',
        content=f'"{VALID_URL}"',
        headers={'content-type': 'application/json'},
    )
    assert resp.status_code == 422, msg(422, resp.status_code)
    body_text = resp.text
    assert VALID_URL not in body_text
    assert VALID_TOKEN not in body_text


# ── AC2/AC3: duplicate URL is a 409, never the DB error ──────────


async def test_create_duplicate_url_is_409(
    admin_client: AsyncClient, db_session: AsyncSession
):
    first = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    assert first.status_code == 201, msg(201, first.status_code)

    second = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(guild_id=GUILD_ID_2),
    )
    assert second.status_code == 409, msg(409, second.status_code)
    assert second.json() == {'detail': 'This webhook is already configured'}
    assert VALID_URL not in second.text


async def test_update_to_a_duplicate_url_is_409(
    admin_client: AsyncClient, db_session: AsyncSession
):
    first = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    second = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(webhook_url=OTHER_URL, guild_id=GUILD_ID_2),
    )
    second_id = second.json()['id']

    resp = await admin_client.patch(
        f'/admin/discord-webhooks/{second_id}',
        json={'webhook_url': VALID_URL},
    )
    assert resp.status_code == 409, msg(409, resp.status_code)
    assert resp.json() == {'detail': 'This webhook is already configured'}
    assert VALID_URL not in resp.text
    assert first.json()['id'] != second_id  # sanity: two distinct rows


# ── 404s ──────────────────────────────────────────────────────────


async def test_update_unknown_webhook_is_404(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.patch(
        '/admin/discord-webhooks/999999999', json={'label': 'x'}
    )
    assert resp.status_code == 404, msg(404, resp.status_code)
    assert resp.json() == {'detail': 'Discord webhook not found'}


async def test_delete_unknown_webhook_is_404(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.delete('/admin/discord-webhooks/999999999')
    assert resp.status_code == 404, msg(404, resp.status_code)


# ── PATCH partial semantics (T118) ───────────────────────────────


async def test_patch_blank_url_keeps_the_stored_one(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    webhook_id = created.json()['id']
    masked_before = created.json()['webhook_url_masked']

    resp = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'webhook_url': '   ', 'label': 'still same url'},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['webhook_url_masked'] == masked_before


async def test_patch_new_url_is_revalidated(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    webhook_id = created.json()['id']

    bad = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'webhook_url': 'https://evil.example.com/x'},
    )
    assert bad.status_code == 422, msg(422, bad.status_code)

    good = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'webhook_url': OTHER_URL},
    )
    assert good.status_code == 200, msg(200, good.status_code)
    assert good.json()['webhook_url_masked'] == (
        f'https://discord.com/api/webhooks/{OTHER_ID}/…{OTHER_TOKEN[-4:]}'
    )


async def test_patch_label_null_clears_it(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    webhook_id = created.json()['id']
    assert created.json()['label'] == 'Community reports'

    resp = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'label': None},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['label'] is None


async def test_patch_omitting_label_keeps_it(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    webhook_id = created.json()['id']

    resp = await admin_client.patch(
        f'/admin/discord-webhooks/{webhook_id}',
        json={'guild_id': GUILD_ID_2},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['label'] == 'Community reports'
    assert resp.json()['guild_id'] == GUILD_ID_2


# ── list_by_guild_ids (K8's submit-time lookup) ──────────────────


async def test_list_by_guild_ids_returns_only_the_matching_servers(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """No route calls this yet (K8); exercised directly through the
    repository, same session the app uses."""
    from app.domain.repositories.discord_report_webhook_repository import (
        DiscordReportWebhookRepository,
    )

    first = await admin_client.post(
        '/admin/discord-webhooks', json=_create_payload()
    )
    second = await admin_client.post(
        '/admin/discord-webhooks',
        json=_create_payload(webhook_url=OTHER_URL, guild_id=GUILD_ID_2),
    )
    assert first.status_code == 201
    assert second.status_code == 201

    repo = DiscordReportWebhookRepository(db_session)

    matched = await repo.list_by_guild_ids([int(GUILD_ID)])
    assert {w.id for w in matched} == {int(first.json()['id'])}

    matched_both = await repo.list_by_guild_ids([
        int(GUILD_ID),
        int(GUILD_ID_2),
    ])
    assert {w.id for w in matched_both} == {
        int(first.json()['id']),
        int(second.json()['id']),
    }

    assert await repo.list_by_guild_ids([]) == []
    assert await repo.list_by_guild_ids([999999999]) == []
