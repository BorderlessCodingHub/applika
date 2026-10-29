"""The caller's devices: ``GET /users/me/sessions``, ``DELETE
/users/me/sessions/{id}`` and ``POST /users/me/sessions/revoke-others``
(KODI-057, ADR-0019, R-009..R-014).

Real Postgres and Redis, the REAL ``get_current_user`` (``real_client``),
sessions opened through the app's own ``OpenSessionUseCase``
(``tests/sessions_seed.py``). No beta feature row exists in these tests:
nothing here is gated (owner: "Gate nothing").
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME
from app.domain.models import UserSessionModel
from tests.base_db_setup import base_data
from tests.sessions_seed import open_session

USER = base_data()['user']
ADMIN = base_data()['admin_user']

ITEM_KEYS = {
    'id',
    'client_type',
    'sign_in_method',
    'device_name',
    'client_label',
    'created_ip',
    'last_ip',
    'created_at',
    'last_used_at',
    'expires_at',
    'ended_at',
    'status',
    'current',
}


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


async def _set_row(engine: AsyncEngine, session_id: int, **values: Any):
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        await session.execute(
            update(UserSessionModel)
            .where(UserSessionModel.id == session_id)
            .values(**values)
        )
        await session.commit()


async def _row(engine: AsyncEngine, session_id: int) -> UserSessionModel:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        row = await session.get(UserSessionModel, session_id)
        assert row is not None
        return row


async def _used_at(redis_client, session_id: int, when: datetime, ip: str):
    await redis_client.hset(
        f'applika:session:id:{session_id}',
        mapping={'last_used_at': when.isoformat(), 'last_ip': ip},
    )


async def _drop_keys(redis_client, tokens) -> None:
    await redis_client.delete(
        f'applika:session:{tokens.refresh_token}',
        f'applika:session:id:{tokens.session_id}',
    )


async def _list(client: AsyncClient, token: str) -> list[dict[str, Any]]:
    response = await client.get('/users/me/sessions', headers=_bearer(token))
    assert response.status_code == 200, response.text
    return response.json()


# --------------------------------------------------------------------------
# AC9 / AC10 / AC13: the list
# --------------------------------------------------------------------------


async def test_list_shape_web_and_cli_and_this_device(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await open_session(
        async_engine, redis_client, USER.id
    )
    cli = await open_session(
        async_engine,
        redis_client,
        USER.id,
        client_type='cli',
        sign_in_method='cli_device',
        user_agent='applika-cli/1.1.0 (Linux)',
        device_name='build-box',
        ip='198.51.100.9',
    )

    items = await _list(real_client, web.access_token)

    assert len(items) == 2
    for item in items:
        assert set(item) == ITEM_KEYS
        assert isinstance(item['id'], str)
    by_id = {item['id']: item for item in items}
    web_item = by_id[str(web.session_id)]
    cli_item = by_id[str(cli.session_id)]
    assert web_item['current'] is True
    assert cli_item['current'] is False
    assert web_item['client_type'] == 'web'
    assert web_item['sign_in_method'] == 'borderless'
    assert web_item['device_name'] == 'Chrome on macOS'
    assert web_item['client_label'] == 'Chrome on macOS'
    assert web_item['status'] == 'active'
    assert web_item['ended_at'] is None
    assert cli_item['client_type'] == 'cli'
    assert cli_item['sign_in_method'] == 'cli_device'
    assert cli_item['device_name'] == 'build-box'
    assert cli_item['client_label'] == 'applika-cli 1.1.0'
    assert cli_item['created_ip'] == '198.51.100.9'
    assert cli_item['last_used_at'] is None
    # The refresh value is never listed.
    response = await real_client.get(
        '/users/me/sessions', headers=_bearer(web.access_token)
    )
    assert web.refresh_token not in response.text
    assert cli.refresh_token not in response.text


async def test_current_follows_the_caller(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await open_session(
        async_engine, redis_client, USER.id
    )
    cli = await open_session(
        async_engine, redis_client, USER.id
    )

    from_cli = await _list(real_client, cli.access_token)
    current = [item['id'] for item in from_cli if item['current']]
    assert current == [str(cli.session_id)]

    # The web carries its access token in the cookie.
    response = await real_client.get(
        '/users/me/sessions',
        cookies={ACCESS_COOKIE_NAME: web.access_token},
    )
    current = [item['id'] for item in response.json() if item['current']]
    assert current == [str(web.session_id)]


async def test_last_used_and_ip_are_read_live_for_active_devices(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    other = await open_session(
        async_engine, redis_client, USER.id
    )
    when = datetime(2026, 10, 14, 9, 30, tzinfo=UTC)
    await _used_at(redis_client, other.session_id, when, '192.0.2.44')

    items = await _list(real_client, caller.access_token)

    item = next(i for i in items if i['id'] == str(other.session_id))
    assert datetime.fromisoformat(item['last_used_at']) == when
    assert item['last_ip'] == '192.0.2.44'
    assert item['created_ip'] == '203.0.113.7'
    # The row was not written: the live value is read, not copied, on GET.
    row = await _row(async_engine, other.session_id)
    assert row.last_used_at is None
    assert row.last_ip == '203.0.113.7'


async def test_order_active_by_last_use_then_ended_by_end(
    real_client: AsyncClient, async_engine, redis_client
):
    now = datetime.now(UTC)
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    used_old = await open_session(
        async_engine, redis_client, USER.id
    )
    never_used = await open_session(
        async_engine, redis_client, USER.id
    )
    used_new = await open_session(
        async_engine, redis_client, USER.id
    )
    ended_old = await open_session(
        async_engine, redis_client, USER.id
    )
    ended_new = await open_session(
        async_engine, redis_client, USER.id
    )
    lost = await open_session(
        async_engine, redis_client, USER.id
    )

    await _used_at(
        redis_client, used_old.session_id, now - timedelta(hours=5), '1.1.1.1'
    )
    await _used_at(
        redis_client, used_new.session_id, now - timedelta(hours=1), '2.2.2.2'
    )
    # ``caller`` is stamped by the list request itself (now).
    for tokens, reason, ended in (
        (ended_old, 'logout', now - timedelta(days=3)),
        (ended_new, 'revoked', now - timedelta(days=1)),
    ):
        await _drop_keys(redis_client, tokens)
        await _set_row(
            async_engine, tokens.session_id, ended_at=ended, end_reason=reason
        )
    # Key gone, row open: ends at its ``expires_at`` (in 7 days), so it
    # sorts first among the ended ones.
    await _drop_keys(redis_client, lost)

    items = await _list(real_client, caller.access_token)

    assert [item['id'] for item in items] == [
        str(caller.session_id),
        str(used_new.session_id),
        str(used_old.session_id),
        str(never_used.session_id),
        str(lost.session_id),
        str(ended_new.session_id),
        str(ended_old.session_id),
    ]
    assert [item['status'] for item in items] == [
        'active',
        'active',
        'active',
        'active',
        'expired',
        'revoked',
        'signed_out',
    ]


async def test_status_for_every_end_reason(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    expected: dict[int, str] = {}
    for reason, status in (
        ('logout', 'signed_out'),
        ('replaced', 'signed_out'),
        ('revoked', 'revoked'),
        ('github_revoked', 'revoked'),
        ('expired', 'expired'),
    ):
        tokens = await open_session(
            async_engine, redis_client, USER.id
        )
        await _drop_keys(redis_client, tokens)
        await _set_row(
            async_engine,
            tokens.session_id,
            ended_at=datetime.now(UTC),
            end_reason=reason,
        )
        expected[tokens.session_id] = status
    past_end = await open_session(
        async_engine, redis_client, USER.id
    )
    await _set_row(
        async_engine,
        past_end.session_id,
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    expected[past_end.session_id] = 'expired'

    items = await _list(real_client, caller.access_token)

    by_id = {item['id']: item['status'] for item in items}
    for session_id, status in expected.items():
        assert by_id[str(session_id)] == status


async def test_history_window_is_session_history_days(
    real_client: AsyncClient, async_engine, redis_client
):
    now = datetime.now(UTC)
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    inside = await open_session(
        async_engine, redis_client, USER.id
    )
    outside = await open_session(
        async_engine, redis_client, USER.id
    )
    old_expired = await open_session(
        async_engine, redis_client, USER.id
    )
    for tokens in (inside, outside, old_expired):
        await _drop_keys(redis_client, tokens)
    await _set_row(
        async_engine,
        inside.session_id,
        ended_at=now - timedelta(days=29),
        end_reason='logout',
    )
    await _set_row(
        async_engine,
        outside.session_id,
        ended_at=now - timedelta(days=31),
        end_reason='logout',
    )
    # An open row whose session lapsed 31 days ago: out of the window too.
    await _set_row(
        async_engine,
        old_expired.session_id,
        expires_at=now - timedelta(days=31),
    )

    ids = {item['id'] for item in await _list(real_client, caller.access_token)}

    assert str(inside.session_id) in ids
    assert str(outside.session_id) not in ids
    assert str(old_expired.session_id) not in ids
    # Rows past the window are kept, only hidden.
    assert (await _row(async_engine, outside.session_id)).ended_at is not None


async def test_list_shows_only_the_callers_devices(
    real_client: AsyncClient, async_engine, redis_client
):
    mine = await open_session(
        async_engine, redis_client, USER.id
    )
    theirs = await open_session(
        async_engine, redis_client, ADMIN.id
    )

    ids = {item['id'] for item in await _list(real_client, mine.access_token)}

    assert ids == {str(mine.session_id)}
    assert str(theirs.session_id) not in ids


async def test_the_list_needs_a_session(real_client: AsyncClient):
    response = await real_client.get('/users/me/sessions')
    assert response.status_code == 401


# --------------------------------------------------------------------------
# AC11: revoke one device
# --------------------------------------------------------------------------


async def test_revoke_another_device(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    other = await open_session(
        async_engine, redis_client, USER.id
    )

    response = await real_client.delete(
        f'/users/me/sessions/{other.session_id}',
        headers=_bearer(caller.access_token),
    )

    assert response.status_code == 204
    assert response.content == b''
    # Revoking another device clears none of the caller's cookies.
    assert response.headers.get('set-cookie') is None
    row = await _row(async_engine, other.session_id)
    assert row.end_reason == 'revoked'
    items = await _list(real_client, caller.access_token)
    assert {i['id']: i['status'] for i in items}[str(other.session_id)] == (
        'revoked'
    )


async def test_revoke_this_device_clears_both_cookies(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )

    response = await real_client.delete(
        f'/users/me/sessions/{caller.session_id}',
        cookies={ACCESS_COOKIE_NAME: caller.access_token},
    )

    assert response.status_code == 204
    cleared = response.headers.get_list('set-cookie')
    assert any(c.startswith(f'{ACCESS_COOKIE_NAME}=""') for c in cleared)
    assert any(c.startswith(f'{REFRESH_COOKIE_NAME}=""') for c in cleared)
    assert (await _row(async_engine, caller.session_id)).end_reason == (
        'revoked'
    )
    after = await real_client.get(
        '/users/me', headers=_bearer(caller.access_token)
    )
    assert after.status_code == 401


async def test_revoke_an_ended_device_is_a_no_op(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    ended = await open_session(
        async_engine, redis_client, USER.id
    )
    ended_at = datetime.now(UTC) - timedelta(days=2)
    await _drop_keys(redis_client, ended)
    await _set_row(
        async_engine, ended.session_id, ended_at=ended_at, end_reason='logout'
    )

    response = await real_client.delete(
        f'/users/me/sessions/{ended.session_id}',
        headers=_bearer(caller.access_token),
    )

    assert response.status_code == 204
    row = await _row(async_engine, ended.session_id)
    assert row.end_reason == 'logout'
    assert row.ended_at == ended_at


async def test_revoke_an_expired_device_is_a_no_op(
    real_client: AsyncClient, async_engine, redis_client
):
    """Plan correction 9: an open row whose key is gone stays "expired";
    DELETE writes nothing."""
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    lost = await open_session(
        async_engine, redis_client, USER.id
    )
    await _drop_keys(redis_client, lost)

    response = await real_client.delete(
        f'/users/me/sessions/{lost.session_id}',
        headers=_bearer(caller.access_token),
    )

    assert response.status_code == 204
    row = await _row(async_engine, lost.session_id)
    assert row.ended_at is None
    assert row.end_reason is None


async def test_revoke_another_users_device_is_404(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    theirs = await open_session(
        async_engine, redis_client, ADMIN.id
    )

    response = await real_client.delete(
        f'/users/me/sessions/{theirs.session_id}',
        headers=_bearer(caller.access_token),
    )

    assert response.status_code == 404
    assert response.json() == {'detail': 'Session not found'}
    assert (await _row(async_engine, theirs.session_id)).ended_at is None
    assert (
        await real_client.get('/users/me', headers=_bearer(theirs.access_token))
    ).status_code == 200


async def test_an_admin_cannot_revoke_another_users_device(
    real_client: AsyncClient, async_engine, redis_client
):
    """ADR-0004: no admin bypass."""
    admin = await open_session(
        async_engine, redis_client, ADMIN.id
    )
    users = await open_session(
        async_engine, redis_client, USER.id
    )

    response = await real_client.delete(
        f'/users/me/sessions/{users.session_id}',
        headers=_bearer(admin.access_token),
    )

    assert response.status_code == 404
    assert response.json() == {'detail': 'Session not found'}
    assert (await _row(async_engine, users.session_id)).ended_at is None


async def test_revoke_an_unknown_id_is_404(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    response = await real_client.delete(
        '/users/me/sessions/123456789',
        headers=_bearer(caller.access_token),
    )
    assert response.status_code == 404
    assert response.json() == {'detail': 'Session not found'}


# --------------------------------------------------------------------------
# AC12: sign out every other device
# --------------------------------------------------------------------------


async def test_revoke_others_ends_every_live_other_device(
    real_client: AsyncClient, async_engine, redis_client
):
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    others = [
        await open_session(async_engine, redis_client, USER.id)
        for _ in range(3)
    ]
    ended = await open_session(
        async_engine, redis_client, USER.id
    )
    await _drop_keys(redis_client, ended)
    await _set_row(
        async_engine,
        ended.session_id,
        ended_at=datetime.now(UTC),
        end_reason='logout',
    )
    lost = await open_session(
        async_engine, redis_client, USER.id
    )
    await _drop_keys(redis_client, lost)
    someone_else = await open_session(
        async_engine, redis_client, ADMIN.id
    )

    response = await real_client.post(
        '/users/me/sessions/revoke-others',
        headers=_bearer(caller.access_token),
    )

    assert response.status_code == 200
    assert response.json() == {'revoked': 3}
    for tokens in others:
        assert (await _row(async_engine, tokens.session_id)).end_reason == (
            'revoked'
        )
        assert (
            await real_client.get(
                '/users/me', headers=_bearer(tokens.access_token)
            )
        ).status_code == 401
    assert (await _row(async_engine, ended.session_id)).end_reason == 'logout'
    assert (await _row(async_engine, lost.session_id)).ended_at is None
    assert (await _row(async_engine, caller.session_id)).ended_at is None
    assert (
        await real_client.get('/users/me', headers=_bearer(caller.access_token))
    ).status_code == 200
    assert (
        await real_client.get(
            '/users/me', headers=_bearer(someone_else.access_token)
        )
    ).status_code == 200

    again = await real_client.post(
        '/users/me/sessions/revoke-others',
        headers=_bearer(caller.access_token),
    )
    assert again.json() == {'revoked': 0}


# --------------------------------------------------------------------------
# AC14: nothing here is behind a beta flag
# --------------------------------------------------------------------------


async def test_no_feature_row_is_needed(
    real_client: AsyncClient, async_engine, redis_client
):
    """``create_all`` seeds no ``features`` row at all: if any route here
    were gated it would answer the gate's 404."""
    caller = await open_session(
        async_engine, redis_client, USER.id
    )
    headers = _bearer(caller.access_token)
    assert (
        await real_client.get('/users/me/sessions', headers=headers)
    ).status_code == 200
    assert (
        await real_client.post(
            '/users/me/sessions/revoke-others', headers=headers
        )
    ).status_code == 200
    assert (
        await real_client.post('/auth/device/code', json={})
    ).status_code == 200
