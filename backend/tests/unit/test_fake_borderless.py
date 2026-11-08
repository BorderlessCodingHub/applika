"""The fake Borderless OpenID Connect provider
(``tests/fixtures/borderless/fake_oidc.py``, ADR-0026 §12) behaves like the
provider Borderless specified: PKCE, client authentication, exact redirect,
single-use expiring codes, rotation with reuse refusal, refusal on demand,
the 30-day window on its clock, the access-token life, the sign-in page and
its session, the split discovery, id_tokens that verify on its JWKS, and a
reset that re-arms the seeded refresh tokens.

Every account and credential is the synthetic ``accounts.json``.
"""

import base64
import json
import secrets
import threading
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import jwt
import pytest

from tests.fixtures.borderless.fake_oidc import (
    SESSION_COOKIE,
    FakeBorderless,
    load_config,
    s256,
    serve,
)

ISSUER = 'http://borderless.test/api/auth'
REDIRECT = 'http://127.0.0.1:8000/api/auth/borderless/callback'
USER = 'e2e-borderless-user'
SEEDED_TOKEN = 'e2eseedtokenuser0000000000000001'

CONFIG = load_config()
CLIENT_ID = CONFIG['client']['client_id']
CLIENT_SECRET = CONFIG['client']['client_secret']


def basic(client_id: str = CLIENT_ID, secret: str = CLIENT_SECRET) -> str:
    raw = f'{client_id}:{secret}'.encode()
    return 'Basic ' + base64.b64encode(raw).decode()


@pytest.fixture
def fake() -> FakeBorderless:
    return FakeBorderless(CONFIG, ISSUER, access_ttl=3600)


@pytest.fixture
async def http(fake: FakeBorderless) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(transport=fake.transport()) as client:
        yield client


def authorize_params(**override: Any) -> dict[str, str]:
    verifier = override.pop('verifier', 'v' * 43)
    params = {
        'response_type': 'code',
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT,
        'scope': 'openid profile email offline_access',
        'state': 'state-1',
        'nonce': 'nonce-1',
        'code_challenge': s256(verifier),
        'code_challenge_method': 'S256',
    }
    params.update(override)
    return {k: v for k, v in params.items() if v is not None}


def answer(response: httpx.Response) -> dict[str, str]:
    """The query the fake sends the browser back with."""
    assert response.status_code == 303
    location = response.headers['location']
    assert location.startswith(REDIRECT)
    return {k: v[0] for k, v in parse_qs(urlsplit(location).query).items()}


async def sign_in(
    http: httpx.AsyncClient, sub: str = USER, **override: Any
) -> httpx.Response:
    """The sign-in page, then the one-click account button, in a browser
    with no Borderless session yet."""
    http.cookies.clear()
    params = authorize_params(**override)
    page = await http.get(f'{ISSUER}/oauth2/authorize', params=params)
    assert page.status_code == 200
    return await http.post(
        f'{ISSUER}/oauth2/authorize', data={**params, 'account': sub}
    )


async def code_for(
    http: httpx.AsyncClient, sub: str = USER, verifier: str = 'v' * 43
) -> str:
    return answer(await sign_in(http, sub, verifier=verifier))['code']


async def exchange(
    http: httpx.AsyncClient,
    code: str,
    verifier: str = 'v' * 43,
    *,
    redirect_uri: str = REDIRECT,
    auth: str | None = None,
) -> httpx.Response:
    return await http.post(
        f'{ISSUER}/oauth2/token',
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'code_verifier': verifier,
        },
        headers={'Authorization': auth or basic()},
    )


async def refresh(http: httpx.AsyncClient, token: str) -> httpx.Response:
    return await http.post(
        f'{ISSUER}/oauth2/token',
        data={'grant_type': 'refresh_token', 'refresh_token': token},
        headers={'Authorization': basic()},
    )


async def grant(http: httpx.AsyncClient, sub: str = USER) -> dict[str, Any]:
    response = await exchange(http, await code_for(http, sub))
    assert response.status_code == 200
    return response.json()


async def claims_of(http: httpx.AsyncClient, id_token: str) -> dict[str, Any]:
    keys = jwt.PyJWKSet.from_dict((await http.get(f'{ISSUER}/jwks')).json())
    kid = jwt.get_unverified_header(id_token)['kid']
    return jwt.decode(
        id_token,
        keys[kid].key,
        algorithms=['EdDSA'],
        audience=CLIENT_ID,
        issuer=ISSUER,
    )


# --------------------------------------------------------------------------
# Discovery and keys
# --------------------------------------------------------------------------


async def test_discovery_lives_under_the_issuer(http) -> None:
    doc = (await http.get(f'{ISSUER}/.well-known/openid-configuration')).json()

    assert doc['issuer'] == ISSUER
    assert doc['authorization_endpoint'] == f'{ISSUER}/oauth2/authorize'
    assert doc['token_endpoint'] == f'{ISSUER}/oauth2/token'
    assert doc['revocation_endpoint'] == f'{ISSUER}/oauth2/revoke'
    assert doc['jwks_uri'] == f'{ISSUER}/jwks'
    assert doc['code_challenge_methods_supported'] == ['S256']
    assert doc['id_token_signing_alg_values_supported'] == ['EdDSA']
    assert doc['token_endpoint_auth_methods_supported'] == [
        'client_secret_basic'
    ]
    assert 'userinfo_endpoint' not in doc


async def test_discovery_splits_the_browser_host_from_the_api_host() -> None:
    fake = FakeBorderless(
        CONFIG,
        'http://borderless-fake:8081/api/auth',
        public_url='http://127.0.0.1:8181',
    )
    doc = fake.discovery()

    assert doc['issuer'] == 'http://borderless-fake:8081/api/auth'
    assert (
        doc['authorization_endpoint']
        == 'http://127.0.0.1:8181/api/auth/oauth2/authorize'
    )
    assert (
        doc['token_endpoint']
        == 'http://borderless-fake:8081/api/auth/oauth2/token'
    )
    assert doc['jwks_uri'] == 'http://borderless-fake:8081/api/auth/jwks'


async def test_the_id_token_verifies_on_its_jwks(http) -> None:
    tokens = await grant(http)
    claims = await claims_of(http, tokens['id_token'])

    assert jwt.get_unverified_header(tokens['id_token'])['alg'] == 'EdDSA'
    assert claims['sub'] == USER
    assert claims['nonce'] == 'nonce-1'
    assert claims['email'] == 'e2e-user@e2e.applika.dev'
    assert claims['email_verified'] is True
    assert claims['borderless_membership'] == 'PSP'
    assert claims['name'] == 'e2e-user'
    assert claims['preferred_username'] == 'e2e-user'
    assert claims['exp'] - claims['iat'] == 10 * 3600


async def test_a_rotated_key_leaves_the_jwks(fake, http) -> None:
    old_kid = fake.kid
    new_kid = fake.rotate_key()

    kids = [k['kid'] for k in (await http.get(f'{ISSUER}/jwks')).json()['keys']]
    assert kids == [new_kid]
    assert old_kid != new_kid


async def test_health(http) -> None:
    response = await http.get('http://borderless.test/health')
    assert response.json() == {'status': 'ok'}


# --------------------------------------------------------------------------
# Authorize: the sign-in page, its session and its refusals
# --------------------------------------------------------------------------


async def test_the_sign_in_page_offers_a_form_and_the_accounts(http) -> None:
    page = await http.get(
        f'{ISSUER}/oauth2/authorize', params=authorize_params()
    )

    assert page.status_code == 200
    assert 'name="email"' in page.text
    assert 'name="password"' in page.text
    for account in CONFIG['accounts']:
        assert account['email'] in page.text
        assert account['password'] not in page.text


async def test_picking_an_account_returns_code_state_and_iss(http) -> None:
    response = await sign_in(http)
    query = answer(response)

    assert set(query) == {'code', 'state', 'iss'}
    assert query['state'] == 'state-1'
    assert query['iss'] == ISSUER
    assert SESSION_COOKIE in response.headers['set-cookie']


async def test_email_and_password_sign_in(http) -> None:
    params = authorize_params()
    wrong = await http.post(
        f'{ISSUER}/oauth2/authorize',
        data={
            **params,
            'email': 'E2E-USER@e2e.applika.dev',
            'password': 'nope',
        },
    )
    assert wrong.status_code == 401
    assert 'Invalid email or password' in wrong.text

    right = await http.post(
        f'{ISSUER}/oauth2/authorize',
        data={
            **params,
            'email': 'E2E-USER@e2e.applika.dev',
            'password': 'e2e-user-password',
        },
    )
    assert 'code' in answer(right)


async def test_a_session_goes_straight_back_without_a_prompt(http) -> None:
    await sign_in(http)

    again = await http.get(
        f'{ISSUER}/oauth2/authorize', params=authorize_params(state='s2')
    )
    query = answer(again)
    assert query['state'] == 's2'
    assert 'code' in query


async def test_prompt_login_always_shows_the_form(http) -> None:
    await sign_in(http)

    page = await http.get(
        f'{ISSUER}/oauth2/authorize', params=authorize_params(prompt='login')
    )
    assert page.status_code == 200
    assert 'name="password"' in page.text


async def test_prompt_none_without_a_session_is_login_required(http) -> None:
    response = await http.get(
        f'{ISSUER}/oauth2/authorize', params=authorize_params(prompt='none')
    )
    assert answer(response)['error'] == 'login_required'


async def test_a_denied_account_comes_back_access_denied(fake, http) -> None:
    fake.set_account(USER, deny=True)

    query = answer(await sign_in(http))
    assert query['error'] == 'access_denied'
    assert query['state'] == 'state-1'
    assert query['iss'] == ISSUER
    assert 'code' not in query


@pytest.mark.parametrize(
    ('override', 'error'),
    [
        ({'response_type': 'token'}, 'unsupported_response_type'),
        ({'scope': 'profile email'}, 'invalid_scope'),
        ({'code_challenge_method': 'plain'}, 'invalid_request'),
        ({'code_challenge': None}, 'invalid_request'),
        ({'state': None}, 'invalid_request'),
    ],
)
async def test_authorize_refuses_a_bad_request_back_to_the_client(
    http, override, error
) -> None:
    response = await http.get(
        f'{ISSUER}/oauth2/authorize', params=authorize_params(**override)
    )
    assert answer(response)['error'] == error


@pytest.mark.parametrize(
    'override',
    [
        {'client_id': 'someone-else'},
        {'redirect_uri': 'http://127.0.0.1:8000/api/auth/borderless/other'},
        {'redirect_uri': REDIRECT + '/'},
    ],
)
async def test_an_unknown_client_or_redirect_never_redirects(
    http, override
) -> None:
    response = await http.get(
        f'{ISSUER}/oauth2/authorize', params=authorize_params(**override)
    )
    assert response.status_code == 400
    assert 'location' not in response.headers


async def test_both_registered_callbacks_are_accepted(http) -> None:
    for uri in CONFIG['client']['redirect_uris']:
        params = authorize_params(redirect_uri=uri)
        response = await http.post(
            f'{ISSUER}/oauth2/authorize', data={**params, 'account': USER}
        )
        assert response.headers['location'].startswith(uri + '?code=')


# --------------------------------------------------------------------------
# Token: client authentication, PKCE, codes
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    'auth',
    [
        '',
        basic(secret='wrong-secret'),
        basic(client_id='someone-else'),
        'Bearer something',
    ],
)
async def test_the_token_endpoint_needs_http_basic(http, auth) -> None:
    code = await code_for(http)
    response = await http.post(
        f'{ISSUER}/oauth2/token',
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': REDIRECT,
            'code_verifier': 'v' * 43,
            'client_id': CLIENT_ID,
            'client_secret': CLIENT_SECRET,
        },
        headers={'Authorization': auth} if auth else {},
    )
    assert response.status_code == 401
    assert response.json() == {'error': 'invalid_client'}


async def test_the_code_exchange_answers_the_whole_grant(http) -> None:
    response = await exchange(http, await code_for(http))
    body = response.json()

    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert body['token_type'] == 'Bearer'
    assert body['expires_in'] == 3600
    assert body['access_token']
    assert body['refresh_token']
    assert body['id_token']


async def test_the_access_token_life_is_configurable() -> None:
    fake = FakeBorderless(CONFIG, ISSUER, access_ttl=2)
    async with httpx.AsyncClient(transport=fake.transport()) as http:
        assert (await grant(http))['expires_in'] == 2


async def test_pkce_needs_the_matching_verifier(http) -> None:
    verifier = secrets.token_urlsafe(48)
    code = await code_for(http, verifier=verifier)

    wrong = await exchange(http, code, secrets.token_urlsafe(48))
    assert wrong.status_code == 400
    assert wrong.json() == {'error': 'invalid_grant'}

    # The refused exchange spent the code.
    assert (await exchange(http, code, verifier)).status_code == 400


async def test_a_short_verifier_is_refused(http) -> None:
    code = await code_for(http, verifier='short')
    assert (await exchange(http, code, 'short')).status_code == 400


async def test_a_code_is_single_use(http) -> None:
    code = await code_for(http)

    assert (await exchange(http, code)).status_code == 200
    again = await exchange(http, code)
    assert again.status_code == 400
    assert again.json() == {'error': 'invalid_grant'}


async def test_a_code_expires_after_sixty_seconds(fake, http) -> None:
    code = await code_for(http)
    fake.advance(61)

    assert (await exchange(http, code)).json() == {'error': 'invalid_grant'}


async def test_a_code_needs_the_same_redirect_uri(http) -> None:
    code = await code_for(http)
    other = CONFIG['client']['redirect_uris'][1]

    response = await exchange(http, code, redirect_uri=other)
    assert response.json() == {'error': 'invalid_grant'}


async def test_an_unknown_grant_type(http) -> None:
    response = await http.post(
        f'{ISSUER}/oauth2/token',
        data={'grant_type': 'password'},
        headers={'Authorization': basic()},
    )
    assert response.json() == {'error': 'unsupported_grant_type'}


# --------------------------------------------------------------------------
# Refresh: rotation, reuse, refusal on demand, the 30 days
# --------------------------------------------------------------------------


async def test_refresh_rotates_and_reads_the_current_membership(
    fake, http
) -> None:
    first = await grant(http)
    fake.set_account(USER, membership='BASE')

    response = await refresh(http, first['refresh_token'])
    body = response.json()

    assert response.status_code == 200
    assert body['refresh_token'] != first['refresh_token']
    claims = await claims_of(http, body['id_token'])
    assert claims['borderless_membership'] == 'BASE'
    assert claims['sub'] == USER
    assert 'nonce' not in claims


async def test_no_membership_means_no_claim(fake, http) -> None:
    fake.set_account(USER, membership=None)
    claims = await claims_of(http, (await grant(http))['id_token'])
    assert 'borderless_membership' not in claims


async def test_reuse_of_a_rotated_token_revokes_the_family(http) -> None:
    first = await grant(http)
    second = (await refresh(http, first['refresh_token'])).json()

    reused = await refresh(http, first['refresh_token'])
    assert reused.json() == {'error': 'invalid_grant'}
    # The newest token of the family is refused too.
    assert (await refresh(http, second['refresh_token'])).status_code == 400


async def test_a_scripted_revoke_ends_every_grant_of_the_account(
    http,
) -> None:
    tokens = await grant(http)
    other = await grant(http, 'e2e-borderless-admin')

    response = await http.post(
        f'http://borderless.test/__fake/grants/{USER}/revoke'
    )
    # The sign-in's grant and the seeded one.
    assert response.json() == {'revoked': 2}
    assert (await refresh(http, tokens['refresh_token'])).json() == {
        'error': 'invalid_grant'
    }
    assert (await refresh(http, SEEDED_TOKEN)).status_code == 400
    assert (await refresh(http, other['refresh_token'])).status_code == 200


async def test_refresh_works_thirty_days_after_the_sign_in(
    fake, http
) -> None:
    tokens = await grant(http)
    fake.advance(29 * 24 * 3600)
    tokens = (await refresh(http, tokens['refresh_token'])).json()

    # Rotation does not restart the window: it counts from the sign-in.
    fake.advance(1 * 24 * 3600 + 1)
    expired = await refresh(http, tokens['refresh_token'])
    assert expired.json() == {'error': 'invalid_grant'}


async def test_the_clock_control_moves_the_fake_clock(fake, http) -> None:
    before = fake.now()
    response = await http.post(
        'http://borderless.test/__fake/clock', json={'advance_seconds': 120}
    )
    assert response.status_code == 200
    assert fake.now() - before >= 120


# --------------------------------------------------------------------------
# Revocation
# --------------------------------------------------------------------------


async def test_revoke_needs_basic_and_ends_the_family(http) -> None:
    tokens = await grant(http)
    form = {
        'token': tokens['refresh_token'],
        'token_type_hint': 'refresh_token',
    }

    refused = await http.post(f'{ISSUER}/oauth2/revoke', data=form)
    assert refused.status_code == 401

    response = await http.post(
        f'{ISSUER}/oauth2/revoke',
        data=form,
        headers={'Authorization': basic()},
    )
    assert response.status_code == 200
    assert (await refresh(http, tokens['refresh_token'])).status_code == 400

    log = (await http.get('http://borderless.test/__fake/log')).json()
    assert log['revokes'] == [
        {'sub': USER, 'token_type_hint': 'refresh_token', 'known': True}
    ]


async def test_revoking_an_unknown_token_is_200(http) -> None:
    response = await http.post(
        f'{ISSUER}/oauth2/revoke',
        data={'token': 'unknown'},
        headers={'Authorization': basic()},
    )
    assert response.status_code == 200


# --------------------------------------------------------------------------
# Controls: accounts, log, reset
# --------------------------------------------------------------------------


async def test_the_account_control_changes_membership_and_flags(
    fake, http
) -> None:
    response = await http.post(
        f'http://borderless.test/__fake/accounts/{USER}',
        json={'membership': 'starter', 'email_verified': False},
    )
    body = response.json()

    assert response.status_code == 200
    assert body['membership'] == 'starter'
    assert body['email_verified'] is False
    assert 'password' not in body
    assert 'seedRefreshToken' not in body
    claims = await claims_of(http, (await grant(http))['id_token'])
    assert claims['email_verified'] is False
    unknown = await http.post(
        'http://borderless.test/__fake/accounts/nobody', json={}
    )
    assert unknown.status_code == 404


async def test_the_log_carries_no_secret(http) -> None:
    tokens = await grant(http)
    await refresh(http, tokens['refresh_token'])
    await refresh(http, 'not-a-token')

    log = (await http.get('http://borderless.test/__fake/log')).json()
    text = json.dumps(log)

    assert log['authorize'][0]['code_challenge_method'] == 'S256'
    assert log['authorize'][0]['state'] == 'state-1'
    assert log['authorize'][0]['nonce'] == 'nonce-1'
    assert 'prompt' not in log['authorize'][0]
    assert [g['grant_type'] for g in log['grants'][USER]] == [
        'authorization_code',
        'refresh_token',
    ]
    assert log['token_errors'][-1]['error'] == 'invalid_grant'
    for secret in (
        CLIENT_SECRET,
        tokens['refresh_token'],
        tokens['access_token'],
        tokens['id_token'],
        'e2e-user-password',
        SEEDED_TOKEN,
    ):
        assert secret not in text


async def test_the_seeded_refresh_token_works_once_until_reset(http) -> None:
    first = await refresh(http, SEEDED_TOKEN)
    assert first.status_code == 200
    assert (await refresh(http, SEEDED_TOKEN)).status_code == 400

    reset = await http.post('http://borderless.test/__fake/reset')
    assert reset.status_code == 200
    again = await refresh(http, SEEDED_TOKEN)
    assert again.status_code == 200
    log = (await http.get('http://borderless.test/__fake/log')).json()
    assert list(log['grants']) == [USER]


async def test_a_test_account_and_its_issued_grant(fake, http) -> None:
    fake.add_account('bl-42', 'someone@example.test', membership='BASE')
    token = fake.issue_refresh_token('bl-42')

    response = await refresh(http, token)
    assert response.status_code == 200
    claims = await claims_of(http, response.json()['id_token'])
    assert claims['sub'] == 'bl-42'
    assert claims['email'] == 'someone@example.test'
    assert claims['borderless_membership'] == 'BASE'
    assert 'name' in claims

    await http.post('http://borderless.test/__fake/reset')
    assert 'bl-42' not in fake.accounts


async def test_reset_restores_the_accounts_and_the_clock(fake, http) -> None:
    fake.set_account(USER, membership='FREE', deny=True)
    fake.advance(3600)
    await http.post('http://borderless.test/__fake/reset')

    assert fake.accounts[USER]['membership'] == 'PSP'
    assert not fake.accounts[USER].get('deny')
    assert fake.offset == 0


async def test_unknown_paths_are_404(http) -> None:
    for method, url in (
        ('GET', f'{ISSUER}/oauth2/userinfo'),
        ('GET', f'{ISSUER}/oauth2/token'),
        ('GET', 'http://borderless.test/__fake/reset'),
        ('POST', 'http://borderless.test/__fake/nothing'),
    ):
        response = await http.request(method, url)
        assert response.status_code == 404, url


# --------------------------------------------------------------------------
# The HTTP adapter
# --------------------------------------------------------------------------


def test_the_http_server_serves_the_same_provider() -> None:
    fake = FakeBorderless(CONFIG, 'http://127.0.0.1:1/api/auth')
    server = serve(fake, 0, '127.0.0.1')
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f'http://127.0.0.1:{port}'
        with httpx.Client(base_url=base) as client:
            assert client.get('/health').json() == {'status': 'ok'}
            doc = client.get('/api/auth/.well-known/openid-configuration')
            assert doc.json()['issuer'] == 'http://127.0.0.1:1/api/auth'
            params = urlencode(authorize_params())
            page = client.get(f'/api/auth/oauth2/authorize?{params}')
            assert page.status_code == 200
            assert 'text/html' in page.headers['content-type']
            token = client.post(
                '/api/auth/oauth2/token',
                data={
                    'grant_type': 'refresh_token',
                    'refresh_token': SEEDED_TOKEN,
                },
                headers={'Authorization': basic()},
            )
            assert token.status_code == 200
    finally:
        server.shutdown()
        server.server_close()
