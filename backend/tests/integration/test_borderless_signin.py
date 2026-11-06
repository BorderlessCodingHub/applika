"""``POST /auth/borderless/signin`` (ADR-0024) on the real stack with the
fake Borderless client: cookies and a ``borderless`` session on the web,
every refusal with its body, the CLI hand-off with no cookie, and no
password or Borderless token in any response or log."""

import logging

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.application.services.borderless_client import (
    BorderlessRateLimited,
    BorderlessUnavailable,
)
from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs
from app.core.tokens import decode_token
from app.domain.models import (
    BorderlessAccountModel,
    UserModel,
    UserSessionModel,
)
from app.presentation.api.auth_handoff import CLI_LOGIN_COOKIE_NAME
from tests.conftest import FakeBorderlessClient, bind_borderless
from tests.integration.conftest import CREDENTIALS
from tests.sessions_seed import open_session

PASSWORD = CREDENTIALS['password']


async def _signin(
    client: AsyncClient, email: str, password: str = PASSWORD, **kw
):
    return await client.post(
        '/auth/borderless/signin',
        json={'email': email, 'password': password},
        **kw,
    )


async def test_web_sign_in_sets_cookies_and_opens_a_borderless_session(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.DEBUG)

    response = await _signin(real_client, CREDENTIALS['email'])

    assert response.status_code == 200
    assert response.json() == {'redirect_to': None, 'new_account': False}
    access = response.cookies.get(ACCESS_COOKIE_NAME)
    assert access
    assert response.cookies.get(REFRESH_COOKIE_NAME)
    payload = decode_token(access)
    assert payload['sub'] == '1'
    row = await db_session.scalar(
        select(UserSessionModel).where(
            UserSessionModel.id == int(payload.get('sid', 0))
        )
    )
    assert (row.client_type, row.sign_in_method) == ('web', 'borderless')
    assert await redis_client.exists(f'applika:session:id:{row.id}') == 1
    # Neither the password nor the Borderless token leaves the server.
    for secret in (PASSWORD, 'tok-user'):
        assert secret not in response.text
        assert all(secret not in v for v in response.headers.values())
        assert secret not in caplog.text


async def test_new_account_is_flagged(
    real_client: AsyncClient,
    db_session,
    redis_client,
    borderless: FakeBorderlessClient,
):
    borderless.add(id='bl-new', email='brand@new.io', name='Brand New')
    response = await _signin(real_client, 'brand@new.io')
    assert response.json() == {'redirect_to': None, 'new_account': True}
    user = await db_session.scalar(
        select(UserModel).where(UserModel.email == 'brand@new.io')
    )
    assert user.username == 'Brand New'
    me = await real_client.get(
        '/users/me',
        cookies={ACCESS_COOKIE_NAME: response.cookies[ACCESS_COOKIE_NAME]},
    )
    assert me.json()['github_restore'] == {'available': True, 'prompt': True}


async def test_email_of_an_existing_account_binds_it_ignoring_case(
    real_client: AsyncClient,
    db_session,
    redis_client,
    borderless: FakeBorderlessClient,
):
    borderless.add(id='bl-x', email='TEST@USER.COM')
    response = await _signin(real_client, 'TEST@USER.COM')
    assert response.json()['new_account'] is False
    binding = await db_session.scalar(select(BorderlessAccountModel))
    assert (binding.user_id, binding.borderless_user_id) == (1, 'bl-x')


async def test_wrong_password_is_401_whatever_the_cause(
    real_client: AsyncClient, redis_client, bound_user
):
    for email, password in [
        (CREDENTIALS['email'], 'wrong'),
        ('nobody@nowhere.io', PASSWORD),
    ]:
        response = await _signin(real_client, email, password)
        assert response.status_code == 401
        assert response.json() == {
            'detail': 'Invalid email or password',
            'code': 'AUTH-1004',
        }


async def test_unverified_email_is_403(
    real_client: AsyncClient, redis_client, borderless: FakeBorderlessClient
):
    borderless.add(id='bl-u', email='u@x.io', verified=False)
    response = await _signin(real_client, 'u@x.io')
    assert response.status_code == 403
    assert response.json() == {
        'detail': 'Verify your email on Borderless first',
        'code': 'AUTH-1005',
    }


async def test_unusable_borderless_email_is_422_with_nothing_written(
    real_client: AsyncClient,
    db_session,
    redis_client,
    borderless: FakeBorderlessClient,
):
    # The typed email fits the request's 100; the one Borderless answers
    # with does not fit users.email.
    account = borderless.add(id='bl-long', email='long@x.io')
    account['email'] = 'a' * 60 + '@' + 'b' * 40 + '.example.com'
    users_before = len(list(await db_session.scalars(select(UserModel))))
    keys_before = set(await redis_client.keys('applika:session:*'))

    response = await _signin(real_client, 'long@x.io')

    assert response.status_code == 422
    assert response.json() == {
        'detail': (
            'This Borderless email cannot be used with applika: it must be '
            'a valid address of at most 100 characters'
        ),
        'code': 'AUTH-1008',
    }
    assert 'set-cookie' not in response.headers
    assert len(list(await db_session.scalars(select(UserModel)))) == (
        users_before
    )
    assert (
        await db_session.scalar(
            select(BorderlessAccountModel).where(
                BorderlessAccountModel.borderless_user_id == 'bl-long'
            )
        )
        is None
    )
    assert set(await redis_client.keys('applika:session:*')) == keys_before


async def test_bound_to_another_borderless_account_is_409(
    real_client: AsyncClient,
    db_session,
    redis_client,
    borderless: FakeBorderlessClient,
):
    await bind_borderless(db_session, 1, borderless_id='bl-old')
    borderless.add(id='bl-new', email='test@user.com')
    response = await _signin(real_client, 'test@user.com')
    assert response.status_code == 409
    assert response.json()['code'] == 'AUTH-1006'
    count = len(list(await db_session.scalars(select(UserModel))))
    assert count == 2


async def test_ambiguous_email_is_409(
    real_client: AsyncClient,
    db_session,
    redis_client,
    borderless: FakeBorderlessClient,
):
    db_session.add_all([
        UserModel(id=60, username='a', email='Dup@Mail.io'),
        UserModel(id=61, username='b', email='dup@mail.io'),
    ])
    await db_session.commit()
    borderless.add(id='bl-dup', email='DUP@mail.io')
    response = await _signin(real_client, 'DUP@mail.io')
    assert response.status_code == 409
    assert response.json()['code'] == 'AUTH-1007'


async def test_per_email_limit_is_429_with_retry_after(
    real_client: AsyncClient, redis_client, bound_user
):
    for _ in range(envs.BORDERLESS_SIGNIN_EMAIL_LIMIT):
        assert (
            await _signin(real_client, CREDENTIALS['email'], 'wrong')
        ).status_code == 401
    response = await _signin(real_client, CREDENTIALS['email'])
    assert response.status_code == 429
    wait = int(response.headers['Retry-After'])
    assert 0 < wait <= envs.BORDERLESS_SIGNIN_EMAIL_WINDOW_SECONDS
    assert response.json() == {
        'detail': f'Too many sign-in attempts. Try again in {wait} seconds.',
        'code': 'AUTH-1009',
        'params': {'seconds': wait},
    }


async def test_borderless_rate_limit_is_429(
    real_client: AsyncClient, redis_client, borderless: FakeBorderlessClient
):
    borderless.sign_in_error = BorderlessRateLimited(17)
    response = await _signin(real_client, 'a@b.io')
    assert response.status_code == 429
    assert response.headers['Retry-After'] == '17'


async def test_borderless_down_is_503_and_open_sessions_keep_working(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    borderless: FakeBorderlessClient,
):
    tokens = await open_session(async_engine, redis_client, 1)
    borderless.sign_in_error = BorderlessUnavailable('down')
    borderless.read_error = BorderlessUnavailable('down')

    response = await _signin(real_client, CREDENTIALS['email'])

    assert response.status_code == 503
    assert response.json() == {
        'detail': 'Borderless is unavailable, try again later',
        'code': 'AUTH-1017',
    }
    me = await real_client.get(
        '/users/me', headers={'Authorization': f'Bearer {tokens.access_token}'}
    )
    assert me.status_code == 200
    refreshed = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )
    assert refreshed.status_code == 200


async def test_not_configured_is_503(
    real_client: AsyncClient, redis_client, borderless: FakeBorderlessClient
):
    borderless.configured = False
    response = await _signin(real_client, 'a@b.io')
    assert response.status_code == 503
    assert response.json() == {
        'detail': 'Borderless sign-in is not configured',
        'code': 'AUTH-1018',
    }


@pytest.mark.parametrize(
    'body',
    [
        {'email': 'a@b.io'},
        {'email': 'a@b.io', 'password': ''},
        {'email': 'x' * 101, 'password': 'p'},
        {'email': 'a@b.io', 'password': 'p' * 201},
    ],
)
async def test_invalid_body_is_422_and_never_echoes_the_password(
    real_client: AsyncClient, redis_client, body
):
    response = await real_client.post('/auth/borderless/signin', json=body)
    assert response.status_code == 422
    assert 'p' * 201 not in response.text


async def test_legacy_cli_sign_in_hands_back_a_code_with_no_cookie(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    auth_handoff_state_use_case,
):
    browser = await open_session(async_engine, redis_client, 1)
    start = await real_client.post(
        '/auth/cli/start',
        json={'callback_url': 'http://127.0.0.1:43129/cb', 'state': 's'},
    )
    login_id = start.json()['login_id']
    entry = await real_client.get(
        f'/auth/cli/login/{login_id}', follow_redirects=False
    )
    assert entry.status_code == 307
    assert entry.headers['location'] == f'{envs.WEB_SIGNIN_URI}?cli=1'

    response = await _signin(
        real_client,
        CREDENTIALS['email'],
        cookies={
            CLI_LOGIN_COOKIE_NAME: login_id,
            REFRESH_COOKIE_NAME: browser.refresh_token,
        },
    )

    assert response.status_code == 200
    redirect_to = response.json()['redirect_to']
    assert redirect_to.startswith('http://127.0.0.1:43129/cb?')
    assert ACCESS_COOKIE_NAME not in response.cookies
    assert REFRESH_COOKIE_NAME not in response.cookies
    rows = list(await db_session.scalars(select(UserSessionModel)))
    assert [r.id for r in rows] == [browser.session_id]
    assert rows[0].ended_at is None
    code = redirect_to.split('code=')[1].split('&')[0]
    exchanged = await real_client.post(
        '/auth/cli/exchange', json={'code': code}
    )
    assert exchanged.status_code == 200
    assert 'tok-user' not in exchanged.text


async def test_unknown_cli_login_is_404_and_expired_one_is_400(
    real_client: AsyncClient, redis_client, bound_user
):
    missing = await real_client.get(
        '/auth/cli/login/nope', follow_redirects=False
    )
    assert missing.status_code == 404
    expired = await _signin(
        real_client, CREDENTIALS['email'], cookies={CLI_LOGIN_COOKIE_NAME: 'x'}
    )
    assert expired.status_code == 400
    assert expired.json() == {
        'detail': 'CLI login expired',
        'code': 'AUTH-1019',
    }


async def test_github_login_now_lands_on_the_signin_page(
    real_client: AsyncClient,
):
    response = await real_client.get(
        '/auth/github/login', follow_redirects=False
    )
    assert response.status_code == 307
    assert response.headers['location'] == envs.WEB_SIGNIN_URI


async def test_discord_link_routes_are_gone(real_client: AsyncClient):
    for method, path in [
        ('POST', '/auth/link/discord'),
        ('GET', '/auth/link/discord/callback'),
        ('DELETE', '/auth/link/discord'),
    ]:
        response = await real_client.request(method, path)
        assert response.status_code == 404, (method, path)
