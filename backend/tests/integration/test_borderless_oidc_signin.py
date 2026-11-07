"""Sign in with Borderless through OpenID Connect (ADR-0026 §1-§5, §11) on
the real stack (Postgres, Redis, the real ``get_current_user``) against the
fake Borderless: the web round trip (cookies, a ``borderless`` session,
``replaced``, the access token in Redis and never in Postgres), the
attempt's binding (single use, this browser, ten minutes, the newest
attempt wins), every refusal as ``?error=<code>``, the legacy CLI hand-off
with ``prompt=login`` and no cookie, the password routes gone, and no
code, state, token or secret in a log. Nothing reaches the real Borderless.
"""

import asyncio
import logging
from urllib.parse import parse_qs, urlsplit

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.application.services.borderless_oidc import (
    BorderlessRejected,
    BorderlessUnavailable,
)
from app.application.use_cases.borderless.sign_in import (
    BorderlessSignInUseCase,
)
from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs
from app.core.crypto import decrypt_borderless_token
from app.core.tokens import decode_token
from app.domain.models import (
    BorderlessAccountModel,
    UserBadgeModel,
    UserModel,
    UserSessionModel,
)
from app.presentation.api.auth_handoff import LOGIN_COOKIE_NAME
from tests import borderless_flow as flow
from tests.conftest import BORDERLESS_CONFIG, bind_borderless
from tests.integration.conftest import BOUND_SUB
from tests.sessions_seed import open_session

PSP = 'e2e-borderless-user'
UNVERIFIED = 'e2e-borderless-unverified'
FREE = 'e2e-borderless-free'
LOGIN_PREFIX = 'applika:borderless:login:'


@pytest.fixture
async def browser(fake_borderless):
    async with flow.fake_browser(fake_borderless) as client:
        yield client


def _error(response) -> dict[str, list[str]]:
    assert response.status_code == 307, response.text
    location = response.headers['location']
    assert location.startswith(envs.WEB_SIGNIN_URI), location
    return parse_qs(urlsplit(location).query)


def _signed_in(response) -> int:
    """The browser is back on the sign-in page with a web session; answers
    the session's user id."""
    assert response.status_code == 307, response.text
    assert response.headers['location'] == envs.WEB_SIGNIN_URI
    access = response.cookies.get(ACCESS_COOKIE_NAME)
    assert access
    assert response.cookies.get(REFRESH_COOKIE_NAME)
    return int(decode_token(access)['sub'])


def _attempt_cleared(response) -> None:
    assert any(
        header.startswith(f'{LOGIN_COOKIE_NAME}=""')
        for header in response.headers.get_list('set-cookie')
    )


async def _sessions(db_session, user_id: int) -> list[UserSessionModel]:
    return list(
        await db_session.scalars(
            select(UserSessionModel)
            .where(UserSessionModel.user_id == user_id)
            .order_by(UserSessionModel.created_at)
        )
    )


async def _binding(db_session, user_id: int) -> BorderlessAccountModel:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == user_id
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    return binding


# --------------------------------------------------------------------------
# The web round trip
# --------------------------------------------------------------------------


async def test_login_sends_the_browser_to_borderless_with_the_whole_request(
    real_client: AsyncClient, redis_client, fake_borderless
):
    response = await real_client.get('/auth/borderless/login')

    assert response.status_code == 307
    url = response.headers['location']
    assert url.startswith(f'{fake_borderless.issuer}/oauth2/authorize?')
    params = flow.query_of(url)
    assert params['response_type'] == 'code'
    assert params['client_id'] == BORDERLESS_CONFIG['client']['client_id']
    assert params['redirect_uri'] == envs.BORDERLESS_REDIRECT_URI
    assert params['scope'] == 'openid profile email offline_access'
    assert params['code_challenge_method'] == 'S256'
    assert len(params['code_challenge']) == 43
    assert params['state'] and params['nonce']
    # A web sign-in reuses the Borderless browser session (AC18).
    assert 'prompt' not in params
    # The attempt: the verifier and nonce only in Redis, ten minutes.
    key = f'{LOGIN_PREFIX}{params["state"]}'
    stored = await redis_client.get(key)
    assert stored is not None
    assert params['nonce'] in stored
    assert 590 < await redis_client.ttl(key) <= 600
    cookie = next(
        header
        for header in response.headers.get_list('set-cookie')
        if header.startswith(f'{LOGIN_COOKIE_NAME}=')
    )
    assert 'HttpOnly' in cookie
    assert 'Path=/api/auth/borderless' in cookie
    assert 'Max-Age=600' in cookie
    assert 'samesite=lax' in cookie.lower()


async def test_a_new_member_signs_in_with_a_borderless_session(
    real_client: AsyncClient, db_session, redis_client, browser
):
    response = await flow.borderless_sign_in(real_client, browser, PSP)

    user_id = _signed_in(response)
    _attempt_cleared(response)
    user = await db_session.get(UserModel, user_id)
    assert user is not None
    assert user.email == 'e2e-user@e2e.applika.dev'
    assert user.username == 'e2e-user'
    [row] = await _sessions(db_session, user_id)
    assert (row.client_type, row.sign_in_method) == ('web', 'borderless')
    binding = await _binding(db_session, user_id)
    assert binding.borderless_user_id == PSP
    assert binding.status == 'active'
    assert decrypt_borderless_token(binding.encrypted_refresh_token or '')
    badges = list(
        await db_session.scalars(
            select(UserBadgeModel.badge).where(
                UserBadgeModel.user_id == user_id,
                UserBadgeModel.revoked_at.is_(None),
            )
        )
    )
    assert badges == ['borderless_psp']
    # The access token: encrypted in Redis for its lifetime, never in
    # Postgres.
    key = f'applika:borderless:access:{user_id}'
    assert await redis_client.exists(key) == 1
    assert 3500 < await redis_client.ttl(key) <= 3600
    columns = {c.name for c in BorderlessAccountModel.__table__.columns}
    assert not any('access' in name for name in columns)
    # The session is usable.
    me = await real_client.get('/users/me')
    assert me.status_code == 200
    assert me.json()['borderless']['status'] == 'active'
    assert me.json()['borderless']['checked_at'] is not None
    assert [b['badge'] for b in me.json()['badges']] == ['borderless_psp']


async def test_the_bound_account_opens_and_replaces_the_browsers_session(
    real_client: AsyncClient,
    db_session,
    redis_client,
    browser,
    bound_user,
    async_engine,
):
    earlier = await open_session(async_engine, redis_client, 1)

    response = await flow.borderless_sign_in(
        real_client,
        browser,
        BOUND_SUB,
        cookies={REFRESH_COOKIE_NAME: earlier.refresh_token},
    )

    assert _signed_in(response) == 1
    rows = await _sessions(db_session, 1)
    assert [r.end_reason for r in rows] == ['replaced', None]


async def test_signing_in_again_takes_one_click_with_a_borderless_session(
    real_client: AsyncClient, redis_client, browser, fake_borderless
):
    first = await flow.borderless_sign_in(real_client, browser, PSP)
    _signed_in(first)
    await real_client.get('/auth/logout')

    # The fake still has its browser session: straight back, no form.
    begin = await real_client.get('/auth/borderless/login')
    back = await browser.get(begin.headers['location'])
    assert back.status_code == 303
    second = await flow.return_to_applika(real_client, back)
    _signed_in(second)
    assert len(fake_borderless.log['authorize']) == 2


async def test_the_email_of_an_existing_account_binds_it_ignoring_case(
    real_client: AsyncClient, db_session, redis_client, browser, fake_borderless
):
    fake_borderless.add_account('bl-case', 'TEST@user.com', membership='BASE')

    response = await flow.borderless_sign_in(real_client, browser, 'bl-case')

    assert _signed_in(response) == 1
    assert (await _binding(db_session, 1)).borderless_user_id == 'bl-case'


# --------------------------------------------------------------------------
# The attempt: single use, this browser, ten minutes, newest wins
# --------------------------------------------------------------------------


async def test_a_replayed_return_is_refused(
    real_client: AsyncClient, redis_client, browser
):
    begin = await real_client.get('/auth/borderless/login')
    answer = await flow.at_borderless(browser, begin.headers['location'], PSP)
    first = await flow.return_to_applika(real_client, answer)
    _signed_in(first)

    replay = await real_client.get(
        flow.CALLBACK_PATH,
        params=flow.query_of(answer.headers['location']),
        cookies={LOGIN_COOKIE_NAME: 'whatever'},
    )
    assert _error(replay) == {'error': ['AUTH-1046']}


async def test_a_return_in_another_browser_is_refused(
    real_client: AsyncClient, redis_client, browser, db_session
):
    begin = await real_client.get('/auth/borderless/login')
    answer = await flow.at_borderless(browser, begin.headers['location'], PSP)
    real_client.cookies.clear()  # another browser: no attempt cookie

    response = await flow.return_to_applika(real_client, answer)

    assert _error(response) == {'error': ['AUTH-1046']}
    assert ACCESS_COOKIE_NAME not in response.cookies
    users = await db_session.scalars(
        select(UserModel).where(UserModel.email == 'e2e-user@e2e.applika.dev')
    )
    assert list(users) == []  # nothing created


async def test_an_attempt_older_than_ten_minutes_is_refused(
    real_client: AsyncClient, redis_client, browser, monkeypatch
):
    monkeypatch.setattr(envs, 'BORDERLESS_LOGIN_TTL_SECONDS', 1)
    begin = await real_client.get('/auth/borderless/login')
    answer = await flow.at_borderless(browser, begin.headers['location'], PSP)
    await asyncio.sleep(1.2)

    response = await flow.return_to_applika(real_client, answer)
    assert _error(response) == {'error': ['AUTH-1046']}


async def test_of_two_attempts_in_one_browser_the_newer_wins(
    real_client: AsyncClient, redis_client, browser
):
    """Two tabs: the newer attempt's cookie replaced the older's. The older
    return is refused and leaves the cookie alone; the newer completes."""
    older = await real_client.get('/auth/borderless/login')
    newer = await real_client.get('/auth/borderless/login')
    older_answer = await flow.at_borderless(
        browser, older.headers['location'], PSP
    )
    newer_answer = await browser.get(newer.headers['location'])

    refused = await flow.return_to_applika(real_client, older_answer)
    assert _error(refused) == {'error': ['AUTH-1046']}
    assert not any(
        header.startswith(f'{LOGIN_COOKIE_NAME}=')
        for header in refused.headers.get_list('set-cookie')
    )
    completed = await flow.return_to_applika(real_client, newer_answer)
    _signed_in(completed)


# --------------------------------------------------------------------------
# Every refusal lands on the sign-in page with its code
# --------------------------------------------------------------------------


async def test_borderless_refusing_the_sign_in_is_auth_1047(
    real_client: AsyncClient, redis_client, browser, fake_borderless
):
    fake_borderless.set_account(PSP, deny=True)
    response = await flow.borderless_sign_in(real_client, browser, PSP)
    assert _error(response) == {'error': ['AUTH-1047']}
    _attempt_cleared(response)


@pytest.mark.parametrize('iss', [None, 'https://evil.example.test/api/auth'])
async def test_a_return_without_the_issuer_is_auth_1048(
    real_client: AsyncClient, redis_client, browser, iss
):
    begin = await real_client.get('/auth/borderless/login')
    answer = await flow.at_borderless(browser, begin.headers['location'], PSP)
    params = flow.query_of(answer.headers['location'])
    params.pop('iss')
    if iss:
        params['iss'] = iss

    response = await real_client.get(flow.CALLBACK_PATH, params=params)
    assert _error(response) == {'error': ['AUTH-1048']}


async def test_a_code_borderless_refuses_is_auth_1048(
    real_client: AsyncClient, redis_client, browser
):
    begin = await real_client.get('/auth/borderless/login')
    answer = await flow.at_borderless(browser, begin.headers['location'], PSP)
    params = flow.query_of(answer.headers['location'])
    params['code'] = 'not-the-code'

    response = await real_client.get(flow.CALLBACK_PATH, params=params)
    assert _error(response) == {'error': ['AUTH-1048']}


@pytest.mark.parametrize(
    ('error', 'code'),
    [
        (BorderlessRejected('bad id_token'), 'AUTH-1048'),
        (BorderlessUnavailable('5xx'), 'AUTH-1017'),
    ],
)
async def test_an_exchange_that_fails_says_why(
    real_client: AsyncClient,
    redis_client,
    browser,
    oidc_client,
    monkeypatch,
    error,
    code,
):
    async def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(oidc_client, 'exchange', fail)
    response = await flow.borderless_sign_in(real_client, browser, PSP)
    assert _error(response) == {'error': [code]}


async def test_borderless_down_at_the_start_is_auth_1017(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    oidc_client,
    monkeypatch,
):
    tokens = await open_session(async_engine, redis_client, 1)

    async def down():
        raise BorderlessUnavailable('down')

    monkeypatch.setattr(oidc_client, 'discovery', down)
    response = await real_client.get('/auth/borderless/login')

    assert _error(response) == {'error': ['AUTH-1017']}
    # Open sessions keep working.
    me = await real_client.get(
        '/users/me', headers={'Authorization': f'Bearer {tokens.access_token}'}
    )
    assert me.status_code == 200


async def test_not_configured_is_auth_1018(
    real_client: AsyncClient, redis_client, monkeypatch
):
    monkeypatch.setattr(envs, 'BORDERLESS_CLIENT_SECRET', None)
    response = await real_client.get('/auth/borderless/login')
    assert _error(response) == {'error': ['AUTH-1018']}


async def test_an_unverified_email_is_auth_1005(
    real_client: AsyncClient, db_session, redis_client, browser
):
    response = await flow.borderless_sign_in(real_client, browser, UNVERIFIED)
    assert _error(response) == {'error': ['AUTH-1005']}
    users = await db_session.scalars(
        select(UserModel).where(
            UserModel.email == 'e2e-unverified@e2e.applika.dev'
        )
    )
    assert list(users) == []


async def test_an_email_bound_to_another_borderless_account_is_auth_1006(
    real_client: AsyncClient, db_session, redis_client, browser, fake_borderless
):
    await bind_borderless(db_session, 1, borderless_id='bl-other')
    fake_borderless.add_account('bl-new', 'Test@User.com')

    response = await flow.borderless_sign_in(real_client, browser, 'bl-new')

    assert _error(response) == {'error': ['AUTH-1006']}
    assert (await _binding(db_session, 1)).borderless_user_id == 'bl-other'


async def test_an_ambiguous_email_is_auth_1007(
    real_client: AsyncClient, db_session, redis_client, browser, fake_borderless
):
    db_session.add(UserModel(id=50, username='upper', email='Mixed@Case.com'))
    db_session.add(UserModel(id=51, username='lower', email='mixed@case.com'))
    await db_session.commit()
    fake_borderless.add_account('bl-mix', 'MIXED@case.com')

    response = await flow.borderless_sign_in(real_client, browser, 'bl-mix')
    assert _error(response) == {'error': ['AUTH-1007']}


async def test_an_unusable_email_is_auth_1008(
    real_client: AsyncClient, redis_client, browser, fake_borderless
):
    fake_borderless.add_account('bl-long', 'a' * 95 + '@example.com')
    response = await flow.borderless_sign_in(real_client, browser, 'bl-long')
    assert _error(response) == {'error': ['AUTH-1008']}


async def test_anything_unexpected_is_gen_1005_and_logged_without_the_query(
    real_client: AsyncClient, redis_client, browser, monkeypatch, caplog
):
    async def boom(self, identity, grant):
        raise RuntimeError('boom')

    monkeypatch.setattr(BorderlessSignInUseCase, 'execute', boom)
    with caplog.at_level(logging.INFO, logger='app'):
        response = await flow.borderless_sign_in(real_client, browser, PSP)

    assert _error(response) == {'error': ['GEN-1005']}
    errors = [r for r in caplog.records if r.levelname == 'ERROR']
    assert any('RuntimeError' in r.getMessage() for r in errors)


# --------------------------------------------------------------------------
# The legacy CLI hand-off (0.1.4 to 1.0.1): prompt=login, no cookie
# --------------------------------------------------------------------------


async def test_legacy_cli_sign_in_hands_back_a_code_with_no_cookie(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    browser,
    bound_user,
):
    browser_session = await open_session(async_engine, redis_client, 1)
    # The browser is signed in on Borderless already ...
    await flow.borderless_sign_in(
        real_client,
        browser,
        BOUND_SUB,
        cookies={REFRESH_COOKIE_NAME: browser_session.refresh_token},
    )
    web_rows = [r.id for r in await _sessions(db_session, 1)]
    start = await real_client.post(
        '/auth/cli/start',
        json={'callback_url': 'http://127.0.0.1:43129/cb', 'state': 's'},
    )
    login_id = start.json()['login_id']

    entry = await real_client.get(f'/auth/cli/login/{login_id}')
    assert entry.status_code == 307
    params = flow.query_of(entry.headers['location'])
    assert params['prompt'] == 'login'
    # ... and Borderless still asks (AC19).
    page = await browser.get(entry.headers['location'])
    assert page.status_code == 200
    assert 'name="password"' in page.text
    answer = await flow.at_borderless(
        browser, entry.headers['location'], BOUND_SUB
    )
    response = await flow.return_to_applika(real_client, answer)

    assert response.status_code == 307
    redirect_to = response.headers['location']
    assert redirect_to.startswith('http://127.0.0.1:43129/cb?')
    assert ACCESS_COOKIE_NAME not in response.cookies
    assert REFRESH_COOKIE_NAME not in response.cookies
    # The browser's own applika sessions are untouched.
    rows = await _sessions(db_session, 1)
    assert [r.id for r in rows] == web_rows
    code = flow.query_of(redirect_to)['code']
    exchanged = await real_client.post(
        '/auth/cli/exchange', json={'code': code}
    )
    assert exchanged.status_code == 200
    rows = await _sessions(db_session, 1)
    assert rows[-1].sign_in_method == 'cli_legacy'


async def test_unknown_cli_login_is_404_and_an_expired_one_auth_1019(
    real_client: AsyncClient,
    redis_client,
    browser,
    bound_user,
    auth_handoff_state_use_case,
):
    missing = await real_client.get('/auth/cli/login/nope')
    assert missing.status_code == 404

    start = await real_client.post(
        '/auth/cli/start',
        json={'callback_url': 'http://127.0.0.1:43129/cb', 'state': 's'},
    )
    login_id = start.json()['login_id']
    entry = await real_client.get(f'/auth/cli/login/{login_id}')
    answer = await flow.at_borderless(
        browser, entry.headers['location'], BOUND_SUB
    )
    await auth_handoff_state_use_case.delete_login(login_id)

    response = await flow.return_to_applika(real_client, answer)
    assert _error(response) == {'error': ['AUTH-1019'], 'cli': ['1']}


async def test_a_cli_refusal_says_cli(
    real_client: AsyncClient, redis_client, browser
):
    start = await real_client.post(
        '/auth/cli/start',
        json={'callback_url': 'http://127.0.0.1:43129/cb', 'state': 's'},
    )
    entry = await real_client.get(
        f'/auth/cli/login/{start.json()["login_id"]}'
    )
    answer = await flow.at_borderless(
        browser, entry.headers['location'], UNVERIFIED
    )

    response = await flow.return_to_applika(real_client, answer)
    assert _error(response) == {'error': ['AUTH-1005'], 'cli': ['1']}


# --------------------------------------------------------------------------
# What is gone, and what never leaks
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    'path', ['/auth/borderless/signin', '/auth/borderless/confirm']
)
async def test_the_password_routes_are_gone(real_client: AsyncClient, path):
    response = await real_client.post(
        path, json={'email': 'a@b.io', 'password': 'pw'}
    )
    assert response.status_code == 404
    assert response.json() == {'detail': 'Not Found', 'code': 'GEN-1001'}


async def test_github_login_now_lands_on_the_signin_page(
    real_client: AsyncClient,
):
    response = await real_client.get('/auth/github/login')
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


async def test_no_code_state_token_or_secret_reaches_a_log_or_a_body(
    real_client: AsyncClient,
    redis_client,
    browser,
    fake_borderless,
    caplog,
):
    with caplog.at_level(logging.DEBUG):
        begin = await real_client.get('/auth/borderless/login')
        attempt_cookie = real_client.cookies.get(LOGIN_COOKIE_NAME)
        answer = await flow.at_borderless(
            browser, begin.headers['location'], PSP
        )
        callback = await flow.return_to_applika(real_client, answer)
        me = await real_client.get('/users/me')
        refused = await flow.borderless_sign_in(real_client, browser, FREE)
        fake_borderless.set_account(FREE, deny=True)
        denied = await flow.borderless_sign_in(real_client, browser, FREE)

    query = flow.query_of(answer.headers['location'])
    authorize = flow.query_of(begin.headers['location'])
    secrets = [
        query['code'],
        query['state'],
        authorize['nonce'],
        attempt_cookie or 'no-cookie',
        BORDERLESS_CONFIG['client']['client_secret'],
        *fake_borderless.refresh_tokens,
    ]
    # The app's own logs (the test clients' httpx log is the test's).
    text = '\n'.join(
        f'{r.getMessage()} {getattr(r, "extra_data", "")}'
        for r in caplog.records
        if r.name == 'app' or r.name.startswith(('app.', 'uvicorn'))
    )
    bodies = ' '.join(
        r.text + str(r.headers.get('location', '')).split('?')[0]
        for r in (callback, me, refused, denied)
    )
    for secret in secrets:
        assert secret not in text
        assert secret not in bodies
    assert 'eyJ' not in text  # no JWT: no id_token, no applika token
    assert '?[redacted]' in text
