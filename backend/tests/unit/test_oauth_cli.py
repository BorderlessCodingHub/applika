"""The browser half of a Borderless sign-in (ADR-0026 §2, §3, §11), with
the use cases mocked: the web and CLI entry points 307 straight to
Borderless with the ``__applika_login`` attempt cookie (``prompt=login``
for a CLI, chosen by ``begin``), and the callback hands the result to the
web (cookies) or back to the CLI (no cookie, the browser's own session
untouched) at the target the attempt stored, only while it is still the
allowed one, or to the sign-in page with ``?error=<code>``."""

from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import pytest
from starlette.requests import Request

from app.application.dto.user_session import SessionTokensDTO
from app.application.use_cases.borderless.complete_login import (
    BorderlessLoginFailed,
    LoginOutcome,
)
from app.config.settings import envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    BORDERLESS_NOT_CONFIGURED,
    ResourceNotFound,
    ServiceUnavailable,
    SessionServiceUnavailable,
)
from app.presentation.api import borderless_auth
from app.presentation.api import oauth as oauth_api
from app.presentation.api.auth_handoff import LOGIN_COOKIE_NAME

AUTHORIZE = 'http://borderless.test/api/auth/oauth2/authorize?state=s'
COOKIE_PATH = 'Path=/api/auth/borderless'
LOOPBACK = 'http://127.0.0.1:43129/callback'
EVIL = 'https://evil.example.test/steal'


def _request(
    query: str = '', cookies: dict[str, str] | None = None
) -> Request:
    headers = []
    if cookies:
        cookie_header = '; '.join(f'{k}={v}' for k, v in cookies.items())
        headers.append((b'cookie', cookie_header.encode()))
    return Request({
        'type': 'http',
        'http_version': '1.1',
        'method': 'GET',
        'scheme': 'http',
        'path': '/auth/borderless/callback',
        'raw_path': b'/auth/borderless/callback',
        'query_string': query.encode(),
        'headers': headers,
        'client': ('testclient', 123),
        'server': ('testserver', 80),
    })


def _begin(answer=None, error: Exception | None = None) -> AsyncMock:
    begin = AsyncMock()
    if error is not None:
        begin.execute.side_effect = error
    else:
        begin.execute.return_value = answer or (AUTHORIZE, 'binding-value')
    return begin


def _complete(
    outcome: LoginOutcome | None = None, error: Exception | None = None
) -> AsyncMock:
    complete = AsyncMock()
    if error is not None:
        complete.execute.side_effect = error
    else:
        complete.execute.return_value = outcome
    return complete


def _tokens() -> SessionTokensDTO:
    return SessionTokensDTO(
        session_id=77,
        user_id=1,
        access_token='access-jwt',
        access_expires_in=900,
        refresh_token='0192f0e1-0000-7000-8000-000000000000',
        refresh_expires_in=604800,
    )


def _cookies(response) -> list[str]:
    return response.headers.getlist('set-cookie')


def _attempt_cookie(response) -> str:
    [cookie] = [c for c in _cookies(response) if LOGIN_COOKIE_NAME in c]
    return cookie


def _error_of(response) -> dict[str, list[str]]:
    location = response.headers['location']
    assert location.startswith(envs.WEB_SIGNIN_URI)
    return parse_qs(urlparse(location).query)


# --------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------


def test_the_attempt_cookie_is_applikas_own():
    assert LOGIN_COOKIE_NAME == '__applika_login'


async def test_web_login_goes_to_borderless_with_the_attempt_cookie():
    begin = _begin()

    response = await borderless_auth.borderless_login(begin)

    assert response.status_code == 307
    assert response.headers['location'] == AUTHORIZE
    begin.execute.assert_awaited_once_with('web')
    cookie = _attempt_cookie(response)
    assert f'{LOGIN_COOKIE_NAME}=binding-value' in cookie
    assert 'HttpOnly' in cookie
    assert 'Max-Age=600' in cookie
    assert COOKIE_PATH in cookie
    assert 'samesite=lax' in cookie.lower()
    assert 'Secure' not in cookie  # not PROD


async def test_the_attempt_cookie_is_secure_in_prod(monkeypatch):
    monkeypatch.setattr(envs, 'ENVIRONMENT', 'PROD')
    response = await borderless_auth.borderless_login(_begin())
    assert 'Secure' in _attempt_cookie(response)


@pytest.mark.parametrize(
    ('error', 'code'),
    [
        (
            ServiceUnavailable(
                BORDERLESS_NOT_CONFIGURED,
                ErrorCode.AUTH_BORDERLESS_NOT_CONFIGURED,
            ),
            'AUTH-1018',
        ),
        (
            ServiceUnavailable('x', ErrorCode.AUTH_BORDERLESS_UNAVAILABLE),
            'AUTH-1017',
        ),
        (RuntimeError('redis down'), 'GEN-1005'),
    ],
)
async def test_web_login_refused_goes_to_the_signin_page(error, code):
    response = await borderless_auth.borderless_login(_begin(error=error))

    assert response.status_code == 307
    assert _error_of(response) == {'error': [code]}
    assert not any(LOGIN_COOKIE_NAME in c for c in _cookies(response))


async def test_cli_login_goes_to_borderless_as_a_cli_attempt():
    handoff = AsyncMock()
    handoff.get_login.return_value = {'login_id': 'login-123'}
    begin = _begin()

    response = await oauth_api.cli_login('login-123', handoff, begin)

    assert response.status_code == 307
    assert response.headers['location'] == AUTHORIZE
    begin.execute.assert_awaited_once_with('cli', 'login-123')
    assert f'{LOGIN_COOKIE_NAME}=binding-value' in _attempt_cookie(response)
    assert not any('__cli_login' in c for c in _cookies(response))


async def test_cli_login_unknown_is_404():
    handoff = AsyncMock()
    handoff.get_login.return_value = None
    with pytest.raises(ResourceNotFound):
        await oauth_api.cli_login('nope', handoff, _begin())


async def test_cli_login_refused_says_cli():
    handoff = AsyncMock()
    handoff.get_login.return_value = {'login_id': 'login-123'}
    begin = _begin(
        error=ServiceUnavailable('x', ErrorCode.AUTH_BORDERLESS_UNAVAILABLE)
    )

    response = await oauth_api.cli_login('login-123', handoff, begin)

    assert _error_of(response) == {'error': ['AUTH-1017'], 'cli': ['1']}


async def test_github_login_redirects_to_the_signin_page():
    response = await oauth_api.auth_init()
    assert response.status_code == 307
    assert response.headers['location'] == envs.WEB_SIGNIN_URI


# --------------------------------------------------------------------------
# The callback
# --------------------------------------------------------------------------


async def test_web_callback_opens_a_borderless_session_and_sets_cookies():
    open_session = AsyncMock()
    open_session.execute.return_value = _tokens()
    end_session = AsyncMock()
    complete = _complete(
        LoginOutcome('web', None, 1, True, envs.WEB_SIGNIN_URI)
    )

    response = await borderless_auth.borderless_callback(
        _request(
            'code=c&state=s&iss=x',
            {'__refresh': 'old', LOGIN_COOKIE_NAME: 'binding-value'},
        ),
        complete,
        AsyncMock(),
        open_session,
        end_session,
    )

    assert response.status_code == 307
    assert response.headers['location'] == envs.WEB_SIGNIN_URI
    params, binding = complete.execute.await_args.args
    assert params == {'code': 'c', 'state': 's', 'iss': 'x'}
    assert binding == 'binding-value'
    cookies = _cookies(response)
    assert any('__access=' in c for c in cookies)
    assert any(
        '__refresh=0192f0e1-0000-7000-8000-000000000000' in c
        and 'Max-Age=604800' in c
        for c in cookies
    )
    assert f'{LOGIN_COOKIE_NAME}=""' in _attempt_cookie(response)
    end_session.end_by_refresh.assert_awaited_once_with(
        'old', 'replaced', user_id=1
    )
    kwargs = open_session.execute.await_args.kwargs
    assert (kwargs['client_type'], kwargs['sign_in_method']) == (
        'web',
        'borderless',
    )


async def test_cli_callback_goes_to_the_loopback_with_no_session_cookie():
    handoff = AsyncMock()
    handoff.get_login.return_value = {
        'login_id': 'login-123',
        'callback_url': LOOPBACK,
        'state': 'xyz',
    }
    handoff.create_exchange_code.return_value = 'exchange-code'
    open_session = AsyncMock()
    end_session = AsyncMock()

    response = await borderless_auth.borderless_callback(
        _request('code=c&state=s&iss=x', {'__refresh': 'browser'}),
        _complete(LoginOutcome('cli', 'login-123', 1, False, LOOPBACK)),
        handoff,
        open_session,
        end_session,
    )

    parsed = urlparse(response.headers['location'])
    assert parsed.netloc == '127.0.0.1:43129'
    assert parse_qs(parsed.query) == {
        'code': ['exchange-code'],
        'state': ['xyz'],
    }
    handoff.create_exchange_code.assert_awaited_once_with(
        login_id='login-123', user_id=1
    )
    end_session.end_by_refresh.assert_not_awaited()
    open_session.execute.assert_not_awaited()
    assert not any('__access=' in c for c in _cookies(response))
    assert f'{LOGIN_COOKIE_NAME}=""' in _attempt_cookie(response)


async def test_cli_pkce_oob_goes_to_the_manual_page(monkeypatch):
    monkeypatch.setattr(
        envs, 'CLI_MANUAL_REDIRECT_URI', 'https://web.example/cli/code'
    )
    handoff = AsyncMock()
    handoff.get_login.return_value = {
        'login_id': 'login-9',
        'callback_url': 'oob',
        'state': 's1',
        'flow': 'pkce',
        'code_challenge': 'c' * 43,
    }
    handoff.create_exchange_code.return_value = 'pk-code'

    url = await oauth_api.cli_handoff_redirect(
        'login-9', handoff, user_id=1, target='https://web.example/cli/code'
    )

    parsed = urlparse(url or '')
    assert f'{parsed.scheme}://{parsed.netloc}{parsed.path}' == (
        'https://web.example/cli/code'
    )
    assert parse_qs(parsed.query) == {'code': ['pk-code'], 'state': ['s1']}
    handoff.create_exchange_code.assert_awaited_once_with(
        login_id='login-9',
        user_id=1,
        flow='pkce',
        code_challenge='c' * 43,
        redirect_uri='oob',
    )
    handoff.delete_login.assert_awaited_once_with('login-9')


async def test_a_web_outcome_naming_another_target_is_never_followed():
    open_session = AsyncMock()
    end_session = AsyncMock()

    response = await borderless_auth.borderless_callback(
        _request('code=c&state=s&iss=x', {'__refresh': 'old'}),
        _complete(LoginOutcome('web', None, 1, True, EVIL)),
        AsyncMock(),
        open_session,
        end_session,
    )

    assert response.status_code == 307
    assert _error_of(response) == {'error': ['AUTH-1046']}
    assert EVIL not in response.headers['location']
    open_session.execute.assert_not_awaited()
    end_session.end_by_refresh.assert_not_awaited()
    assert not any('__access=' in c for c in _cookies(response))


@pytest.mark.parametrize(
    ('login', 'target'),
    [
        # A stored target that is not this login's loopback callback.
        (
            {'login_id': 'l', 'callback_url': LOOPBACK, 'state': 'x'},
            EVIL,
        ),
        (
            {'login_id': 'l', 'callback_url': LOOPBACK, 'state': 'x'},
            'http://127.0.0.1:9999/callback',
        ),
        # An oob login ends on the manual page only.
        (
            {
                'login_id': 'l',
                'callback_url': 'oob',
                'state': 'x',
                'flow': 'pkce',
                'code_challenge': 'c' * 43,
            },
            EVIL,
        ),
        # A CLI login whose own callback no longer passes the loopback rules.
        (
            {'login_id': 'l', 'callback_url': EVIL, 'state': 'x'},
            EVIL,
        ),
        ({'login_id': 'l', 'callback_url': 'oob', 'state': 'x'}, 'oob'),
    ],
)
async def test_a_cli_target_that_is_not_the_logins_own_is_never_followed(
    login, target
):
    handoff = AsyncMock()
    handoff.get_login.return_value = login

    response = await borderless_auth.borderless_callback(
        _request('code=c&state=s&iss=x'),
        _complete(LoginOutcome('cli', 'l', 1, False, target)),
        handoff,
        AsyncMock(),
        AsyncMock(),
    )

    assert _error_of(response) == {'error': ['AUTH-1019'], 'cli': ['1']}
    assert EVIL not in response.headers['location']
    # Nothing minted, and the CLI login is not spent.
    handoff.create_exchange_code.assert_not_awaited()
    handoff.delete_login.assert_not_awaited()


async def test_the_query_never_decides_where_the_callback_goes():
    open_session = AsyncMock()
    open_session.execute.return_value = _tokens()

    response = await borderless_auth.borderless_callback(
        _request(
            'code=c&state=s&iss=x&redirect_uri=https%3A%2F%2Fevil.example.test'
            '&next=https%3A%2F%2Fevil.example.test&target=%2F%2Fevil.example'
            '&return_to=https%3A%2F%2Fevil.example.test'
        ),
        _complete(LoginOutcome('web', None, 1, True, envs.WEB_SIGNIN_URI)),
        AsyncMock(),
        open_session,
        AsyncMock(),
    )

    assert response.headers['location'] == envs.WEB_SIGNIN_URI


async def test_an_expired_cli_login_is_auth_1019_for_the_cli():
    handoff = AsyncMock()
    handoff.get_login.return_value = None

    response = await borderless_auth.borderless_callback(
        _request('code=c&state=s&iss=x'),
        _complete(LoginOutcome('cli', 'gone', 1, False, LOOPBACK)),
        handoff,
        AsyncMock(),
        AsyncMock(),
    )

    assert _error_of(response) == {'error': ['AUTH-1019'], 'cli': ['1']}
    assert f'{LOGIN_COOKIE_NAME}=""' in _attempt_cookie(response)


@pytest.mark.parametrize(
    ('failed', 'expected'),
    [
        (
            BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED),
            {'error': ['AUTH-1046']},
        ),
        (
            BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_DENIED, 'web'),
            {'error': ['AUTH-1047']},
        ),
        (
            BorderlessLoginFailed(ErrorCode.AUTH_EMAIL_UNVERIFIED, 'cli'),
            {'error': ['AUTH-1005'], 'cli': ['1']},
        ),
        (
            BorderlessLoginFailed(
                ErrorCode.GEN_INTERNAL_ERROR, 'web', unexpected=True
            ),
            {'error': ['GEN-1005']},
        ),
    ],
)
async def test_a_refused_callback_goes_to_the_signin_page(failed, expected):
    open_session = AsyncMock()

    response = await borderless_auth.borderless_callback(
        _request('error=access_denied&state=s'),
        _complete(error=failed),
        AsyncMock(),
        open_session,
        AsyncMock(),
    )

    assert response.status_code == 307
    assert _error_of(response) == expected
    open_session.execute.assert_not_awaited()
    if failed.code == ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED:
        # The cookie may be a newer attempt's (another tab): kept.
        assert not any(LOGIN_COOKIE_NAME in c for c in _cookies(response))
    else:
        assert f'{LOGIN_COOKIE_NAME}=""' in _attempt_cookie(response)


async def test_the_session_store_down_after_sign_in_says_so():
    open_session = AsyncMock()
    open_session.execute.side_effect = SessionServiceUnavailable()

    response = await borderless_auth.borderless_callback(
        _request('code=c&state=s&iss=x'),
        _complete(LoginOutcome('web', None, 1, False, envs.WEB_SIGNIN_URI)),
        AsyncMock(),
        open_session,
        AsyncMock(),
    )

    assert _error_of(response) == {'error': ['AUTH-1003']}
    assert not any('__access=' in c for c in _cookies(response))


async def test_anything_unexpected_after_sign_in_is_gen_1005(caplog):
    open_session = AsyncMock()
    open_session.execute.side_effect = RuntimeError('secret detail')

    response = await borderless_auth.borderless_callback(
        _request('code=secret-code&state=s&iss=x'),
        _complete(LoginOutcome('cli', None, 1, False, LOOPBACK)),
        AsyncMock(),
        open_session,
        AsyncMock(),
    )

    assert _error_of(response) == {'error': ['AUTH-1019'], 'cli': ['1']}
    response = await borderless_auth.borderless_callback(
        _request('code=secret-code&state=s&iss=x'),
        _complete(LoginOutcome('web', None, 1, False, envs.WEB_SIGNIN_URI)),
        AsyncMock(),
        open_session,
        AsyncMock(),
    )
    assert _error_of(response) == {'error': ['GEN-1005']}
    text = ' '.join(r.getMessage() for r in caplog.records)
    assert 'RuntimeError' in text
    assert 'secret-code' not in text
    assert 'secret detail' not in text
