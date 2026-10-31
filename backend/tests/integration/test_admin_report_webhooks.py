"""``/admin/report-webhooks`` (ADR-0024): an administrator lists, adds,
changes and removes report webhooks, each with an address, one or more
badges (BASE, PSP or both, never none) and an optional label. Only a masked address is ever answered, and
a 422 never echoes the submitted URL. ``/admin/discord-webhooks`` is gone.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config.db import get_session
from app.domain.models import ReportWebhookBadgeModel, ReportWebhookModel
from app.domain.repositories.report_webhook_repository import (
    ReportWebhookRepository,
)
from app.main import app as main_app
from tests import msg
from tests.error_catalog import code_for

VALID_ID = '123456789012345678'
VALID_TOKEN = 'AbCdEfGhIjKlMnOpQrSt0123456789'
VALID_URL = f'https://discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}'
OTHER_ID = '223456789012345678'
OTHER_TOKEN = 'ZzYyXxWwVvUuTtSsRrQq9876543210'
OTHER_URL = f'https://discord.com/api/webhooks/{OTHER_ID}/{OTHER_TOKEN}'
MASKED = f'https://discord.com/api/webhooks/{VALID_ID}/…6789'


@pytest_asyncio.fixture
async def raw_client(async_engine):
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


def _payload(**overrides):
    payload = {
        'webhook_url': VALID_URL,
        'badges': ['borderless_psp'],
        'label': 'PSP reports',
    }
    payload.update(overrides)
    return payload


def _no_secret(response) -> None:
    assert VALID_TOKEN not in response.text
    assert OTHER_TOKEN not in response.text


async def test_unauthenticated_is_401(raw_client: AsyncClient):
    response = await raw_client.get('/admin/report-webhooks')
    assert response.status_code == 401


@pytest.mark.parametrize(
    ('method', 'path', 'body'),
    [
        ('get', '/admin/report-webhooks', None),
        ('post', '/admin/report-webhooks', _payload()),
        ('patch', '/admin/report-webhooks/1', {'label': 'x'}),
        ('delete', '/admin/report-webhooks/1', None),
    ],
)
async def test_non_admin_is_403(async_client: AsyncClient, method, path, body):
    response = await async_client.request(method.upper(), path, json=body)
    assert response.status_code == 403
    assert response.json() == {
        'detail': 'Admin access required',
        'code': 'ADM-1001',
    }


async def test_discord_webhook_routes_are_gone(admin_client: AsyncClient):
    assert (await admin_client.get('/admin/discord-webhooks')).status_code == (
        404
    )
    response = await admin_client.post(
        '/admin/discord-webhooks', json={'webhook_url': VALID_URL}
    )
    assert response.status_code in (404, 405)


async def test_admin_can_create_list_update_and_delete_a_webhook(
    admin_client: AsyncClient,
):
    created = await admin_client.post('/admin/report-webhooks', json=_payload())
    assert created.status_code == 201, msg(201, created.status_code)
    body = created.json()
    assert set(body) == {
        'id',
        'label',
        'badges',
        'webhook_url_masked',
        'created_at',
        'updated_at',
    }
    assert body['badges'] == ['borderless_psp']
    assert body['label'] == 'PSP reports'
    assert body['webhook_url_masked'] == MASKED
    _no_secret(created)
    webhook_id = body['id']

    listed = await admin_client.get('/admin/report-webhooks')
    assert [w['id'] for w in listed.json()] == [webhook_id]
    _no_secret(listed)

    updated = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}',
        json={'badges': ['BASE'], 'label': 'BASE reports'},
    )
    assert updated.status_code == 200
    assert updated.json()['badges'] == ['borderless_base']
    assert updated.json()['label'] == 'BASE reports'
    assert updated.json()['updated_at'] is not None

    deleted = await admin_client.delete(f'/admin/report-webhooks/{webhook_id}')
    assert deleted.status_code == 204
    assert (await admin_client.get('/admin/report-webhooks')).json() == []


async def test_label_is_optional(admin_client: AsyncClient):
    response = await admin_client.post(
        '/admin/report-webhooks', json=_payload(label=None)
    )
    assert response.status_code == 201
    assert response.json()['label'] is None


@pytest.mark.parametrize(
    'payload',
    [
        _payload(badges=None),
        {'webhook_url': VALID_URL},
        _payload(badges=[]),
        _payload(badges=['free']),
        _payload(badges=['base', 'BASE']),
        _payload(badges='borderless_psp'),
        _payload(badges=[3]),
        {'webhook_url': VALID_URL, 'badge': 'borderless_psp'},
        _payload(webhook_url='https://evil.example.com/hook'),
        _payload(webhook_url=None),
        _payload(label='x' * 101),
    ],
    ids=[
        'badges-null',
        'badges-missing',
        'badges-empty',
        'badges-other',
        'badges-duplicate',
        'badges-not-a-list',
        'badges-not-strings',
        'old-badge-field',
        'bad-url',
        'no-url',
        'long-label',
    ],
)
async def test_invalid_create_is_422_and_never_echoes_the_url(
    admin_client: AsyncClient, payload
):
    response = await admin_client.post('/admin/report-webhooks', json=payload)
    assert response.status_code == 422, msg(422, response.status_code)
    _no_secret(response)


@pytest.mark.parametrize(
    'body',
    [[VALID_URL], f'"{VALID_URL}"', {'webhook_url': [VALID_URL]}],
    ids=['list', 'json-string', 'url-as-list'],
)
async def test_type_errors_never_echo_the_url(admin_client: AsyncClient, body):
    if isinstance(body, str):
        response = await admin_client.post(
            '/admin/report-webhooks',
            content=body,
            headers={'Content-Type': 'application/json'},
        )
    else:
        response = await admin_client.post('/admin/report-webhooks', json=body)
    assert response.status_code == 422
    _no_secret(response)


async def test_a_webhook_can_hold_both_badges(admin_client: AsyncClient):
    created = await admin_client.post(
        '/admin/report-webhooks',
        json=_payload(badges=['PSP', 'borderless_base']),
    )
    assert created.status_code == 201
    assert created.json()['badges'] == ['borderless_base', 'borderless_psp']
    [listed] = (await admin_client.get('/admin/report-webhooks')).json()
    assert listed['badges'] == ['borderless_base', 'borderless_psp']


async def test_patch_badges_replaces_the_set(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post('/admin/report-webhooks', json=_payload())
    webhook_id = created.json()['id']

    both = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}',
        json={'badges': ['base', 'psp']},
    )
    assert both.json()['badges'] == ['borderless_base', 'borderless_psp']
    base_only = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}', json={'badges': ['base']}
    )
    assert base_only.json()['badges'] == ['borderless_base']
    rows = (
        await db_session.execute(
            select(
                ReportWebhookBadgeModel.report_webhook_id,
                ReportWebhookBadgeModel.badge,
            )
        )
    ).all()
    assert rows == [(int(webhook_id), 'borderless_base')]
    # A PATCH without ``badges`` keeps the set.
    labelled = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}', json={'label': 'kept'}
    )
    assert labelled.json()['badges'] == ['borderless_base']


@pytest.mark.parametrize(
    ('badges', 'detail'),
    [
        (None, 'Choose at least one badge: BASE or PSP'),
        ([], 'Choose at least one badge: BASE or PSP'),
        (['free'], 'Badge must be BASE or PSP'),
        (['psp', 'PSP'], 'Each badge can be chosen once'),
    ],
    ids=['null', 'empty', 'other', 'duplicate'],
)
async def test_patch_badges_never_empty_or_unknown(
    admin_client: AsyncClient, badges, detail
):
    created = await admin_client.post('/admin/report-webhooks', json=_payload())
    webhook_id = created.json()['id']
    response = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}', json={'badges': badges}
    )
    assert response.status_code == 422
    assert response.json() == {'detail': detail, 'code': code_for(detail)}
    [listed] = (await admin_client.get('/admin/report-webhooks')).json()
    assert listed['badges'] == ['borderless_psp']


async def test_patch_blank_url_keeps_it_and_new_url_is_revalidated(
    admin_client: AsyncClient,
):
    created = await admin_client.post('/admin/report-webhooks', json=_payload())
    webhook_id = created.json()['id']
    kept = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}', json={'webhook_url': '  '}
    )
    assert kept.json()['webhook_url_masked'] == MASKED
    bad = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}',
        json={'webhook_url': 'http://discord.com/x'},
    )
    assert bad.status_code == 422
    moved = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}', json={'webhook_url': OTHER_URL}
    )
    assert moved.json()['webhook_url_masked'].startswith(
        f'https://discord.com/api/webhooks/{OTHER_ID}/'
    )
    _no_secret(moved)


async def test_patch_label_null_clears_it(admin_client: AsyncClient):
    created = await admin_client.post('/admin/report-webhooks', json=_payload())
    webhook_id = created.json()['id']
    response = await admin_client.patch(
        f'/admin/report-webhooks/{webhook_id}', json={'label': None}
    )
    assert response.json()['label'] is None
    assert response.json()['badges'] == ['borderless_psp']


async def test_duplicate_url_is_409_without_the_url(admin_client: AsyncClient):
    await admin_client.post('/admin/report-webhooks', json=_payload())
    duplicate = await admin_client.post(
        '/admin/report-webhooks', json=_payload(badges=['borderless_base'])
    )
    assert duplicate.status_code == 409
    assert duplicate.json() == {
        'detail': 'This webhook is already configured',
        'code': 'ADM-1018',
    }

    other = await admin_client.post(
        '/admin/report-webhooks', json=_payload(webhook_url=OTHER_URL)
    )
    clash = await admin_client.patch(
        f'/admin/report-webhooks/{other.json()["id"]}',
        json={'webhook_url': VALID_URL},
    )
    assert clash.status_code == 409
    _no_secret(clash)


async def test_unknown_webhook_is_404(admin_client: AsyncClient):
    for method in ('PATCH', 'DELETE'):
        response = await admin_client.request(
            method,
            '/admin/report-webhooks/999',
            json={'label': 'x'} if method == 'PATCH' else None,
        )
        assert response.status_code == 404
        assert response.json() == {
            'detail': 'Report webhook not found',
            'code': 'ADM-1012',
        }


async def test_carried_over_webhook_without_a_badge_is_listed_empty(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """A webhook carried over from before the release has no badge until an
    administrator assigns at least one."""
    db_session.add(ReportWebhookModel(url=VALID_URL, label='old'))
    await db_session.commit()

    [listed] = (await admin_client.get('/admin/report-webhooks')).json()
    assert listed['badges'] == []
    assert listed['webhook_url_masked'] == MASKED

    assigned = await admin_client.patch(
        f'/admin/report-webhooks/{listed["id"]}', json={'badges': ['PSP']}
    )
    assert assigned.json()['badges'] == ['borderless_psp']


async def test_deleting_a_webhook_deletes_its_badges(
    admin_client: AsyncClient, db_session: AsyncSession
):
    created = await admin_client.post(
        '/admin/report-webhooks', json=_payload(badges=['base', 'psp'])
    )
    deleted = await admin_client.delete(
        f'/admin/report-webhooks/{created.json()["id"]}'
    )
    assert deleted.status_code == 204
    assert list(await db_session.scalars(select(ReportWebhookBadgeModel))) == []


async def test_list_by_badges_never_returns_an_unassigned_webhook(
    db_session: AsyncSession,
):
    repo = ReportWebhookRepository(db_session)
    await repo.create(url=VALID_URL, label=None, badges=[])
    await repo.create(
        url=OTHER_URL,
        label=None,
        badges=['borderless_base', 'borderless_psp'],
    )
    # The webhook holding both badges comes back once.
    assert [
        w.url
        for w in await repo.list_by_badges([
            'borderless_base',
            'borderless_psp',
        ])
    ] == [OTHER_URL]
    assert [w.url for w in await repo.list_by_badges(['borderless_psp'])] == [
        OTHER_URL
    ]
    assert await repo.list_by_badges([]) == []
    rows = list(await db_session.scalars(select(ReportWebhookModel)))
    assert 'AbCd' not in repr(rows)
