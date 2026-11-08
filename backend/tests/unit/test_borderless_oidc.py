"""``BorderlessOidcClient`` (ADR-0026 §1-§4, §8, §10) against the fake
Borderless: authorize parameters, discovery, id_token verification (EdDSA
only, issuer, audience, expiry, nonce, signature, keys), the code exchange
with HTTP Basic and PKCE, the refresh grant's outcomes, best-effort
revocation, and no secret or token in a ``repr`` or a log."""

import asyncio
import base64
import json
import logging
import time
from collections.abc import Callable
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)

from app.application.services.borderless_oidc import (
    BorderlessGrantEnded,
    BorderlessNotConfigured,
    BorderlessOidcClient,
    BorderlessRejected,
    BorderlessUnavailable,
)
from app.application.services import borderless_oidc
from app.config.settings import envs
from app.core.pkce import s256_challenge
from tests.conftest import BORDERLESS_CONFIG, BORDERLESS_ISSUER
from tests.fixtures.borderless.fake_oidc import FakeBorderless

CLIENT_ID = BORDERLESS_CONFIG['client']['client_id']
CLIENT_SECRET = BORDERLESS_CONFIG['client']['client_secret']
REDIRECT = BORDERLESS_CONFIG['client']['redirect_uris'][0]
USER = 'e2e-borderless-user'
VERIFIER = 'v' * 43
NONCE = 'nonce-1'

Override = Callable[[httpx.Request], httpx.Response | None]


class Wire:
    """The fake behind a transport that records every request and can
    answer some of them itself."""

    def __init__(self, fake: FakeBorderless) -> None:
        self.fake = fake
        self.requests: list[httpx.Request] = []
        self.override: Override | None = None
        self._inner = fake.transport()

    def transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            if self.override is not None:
                answer = self.override(request)
                if answer is not None:
                    return answer
            return self._inner.handler(request)

        return httpx.MockTransport(handler)

    def to(self, path: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path.endswith(path)]


@pytest.fixture
def wire(fake_borderless) -> Wire:
    return Wire(fake_borderless)


@pytest.fixture
def client(wire) -> BorderlessOidcClient:
    return BorderlessOidcClient(httpx.AsyncClient(transport=wire.transport()))


async def a_code(fake: FakeBorderless, sub: str = USER) -> str:
    """A code the fake issued for ``sub``, as its sign-in page would."""
    params = {
        'response_type': 'code',
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT,
        'scope': 'openid profile email offline_access',
        'state': 's',
        'nonce': NONCE,
        'code_challenge': s256_challenge(VERIFIER),
        'code_challenge_method': 'S256',
    }
    async with httpx.AsyncClient(transport=fake.transport()) as browser:
        answer = await browser.post(
            f'{BORDERLESS_ISSUER}/oauth2/authorize',
            data={**params, 'account': sub},
        )
    location = answer.headers['location']
    return parse_qs(urlsplit(location).query)['code'][0]


def claims(fake: FakeBorderless, **override) -> dict:
    base = fake.id_token_claims(USER, NONCE)
    base.update(override)
    return {k: v for k, v in base.items() if v is not None}


# --------------------------------------------------------------------------
# Discovery and the authorize URL
# --------------------------------------------------------------------------


async def test_discovery_is_read_once_and_cached(client, wire):
    first = await client.discovery()
    second = await client.discovery()

    assert first is second
    assert first.issuer == BORDERLESS_ISSUER
    assert len(wire.to('/.well-known/openid-configuration')) == 1


async def test_discovery_naming_another_issuer_is_unavailable(client, wire):
    def other_issuer(request):
        if request.url.path.endswith('openid-configuration'):
            doc = wire.fake.discovery()
            doc['issuer'] = 'https://evil.example.test/api/auth'
            return httpx.Response(200, json=doc)
        return None

    wire.override = other_issuer
    with pytest.raises(BorderlessUnavailable):
        await client.discovery()


@pytest.mark.parametrize(
    'answer',
    [
        httpx.Response(503),
        httpx.Response(200, text='not json'),
        httpx.Response(200, json={'issuer': BORDERLESS_ISSUER}),
    ],
)
async def test_unreadable_discovery_is_unavailable(client, wire, answer):
    wire.override = lambda request: answer
    with pytest.raises(BorderlessUnavailable):
        await client.discovery()


async def test_discovery_without_s256_or_eddsa_is_unavailable(client, wire):
    def no_pkce(request):
        doc = wire.fake.discovery()
        doc['code_challenge_methods_supported'] = ['plain']
        return httpx.Response(200, json=doc)

    wire.override = no_pkce
    with pytest.raises(BorderlessUnavailable):
        await client.discovery()


async def test_discovery_unreachable_is_unavailable(client, wire):
    def down(request):
        raise httpx.ConnectError('down', request=request)

    wire.override = down
    with pytest.raises(BorderlessUnavailable):
        await client.discovery()


async def test_not_configured(client, monkeypatch):
    monkeypatch.setattr(envs, 'BORDERLESS_CLIENT_SECRET', None)
    assert client.is_configured() is False
    with pytest.raises(BorderlessNotConfigured):
        await client.discovery()


@pytest.mark.parametrize('prompt_login', [False, True])
async def test_authorize_url_carries_the_whole_request(client, prompt_login):
    discovery = await client.discovery()
    url = client.authorize_url(
        discovery,
        state='the-state',
        nonce='the-nonce',
        challenge='the-challenge',
        prompt_login=prompt_login,
    )

    assert url.startswith(f'{BORDERLESS_ISSUER}/oauth2/authorize?')
    assert 'scope=openid%20profile%20email%20offline_access' in url
    params = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
    expected = {
        'response_type': 'code',
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT,
        'scope': 'openid profile email offline_access',
        'state': 'the-state',
        'nonce': 'the-nonce',
        'code_challenge': 'the-challenge',
        'code_challenge_method': 'S256',
    }
    if prompt_login:
        expected['prompt'] = 'login'
    assert params == expected


# --------------------------------------------------------------------------
# id_token verification
# --------------------------------------------------------------------------


async def test_a_good_id_token_gives_the_identity(client, fake_borderless):
    identity = await client.verify_id_token(
        fake_borderless.sign_id_token(claims(fake_borderless)), NONCE
    )
    assert identity.sub == USER
    assert identity.email == 'e2e-user@e2e.applika.dev'
    assert identity.email_verified is True
    assert identity.name == 'e2e-user'
    assert identity.preferred_username == 'e2e-user'
    assert identity.membership == 'PSP'


async def test_a_refreshed_id_token_has_no_nonce_to_check(
    client, fake_borderless
):
    raw = fake_borderless.sign_id_token(claims(fake_borderless, nonce=None))
    assert (await client.verify_id_token(raw, None)).sub == USER


def _unsigned(payload: dict, kid: str) -> str:
    """``alg: none`` under the fake's own key id: only the algorithm pin
    refuses it."""

    def part(data: dict) -> str:
        raw = json.dumps(data).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

    return f'{part({"alg": "none", "kid": kid})}.{part(payload)}.'


@pytest.mark.parametrize(
    'make',
    [
        pytest.param(
            lambda fake: _unsigned(claims(fake), fake.kid), id='alg-none'
        ),
        pytest.param(
            lambda fake: jwt.encode(
                claims(fake),
                'x' * 32,
                algorithm='HS256',
                headers={'kid': fake.kid},
            ),
            id='hs256',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(
                claims(fake, iss='https://evil.example.test/api/auth')
            ),
            id='issuer',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(claims(fake, aud='other-client')),
            id='audience',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(
                claims(fake, exp=int(time.time()) - 120)
            ),
            id='expired',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(claims(fake, nonce='other')),
            id='nonce',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(claims(fake, nonce=None)),
            id='no-nonce',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(
                claims(fake), key=Ed25519PrivateKey.generate()
            ),
            id='signature',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(claims(fake, azp='other-client')),
            id='azp',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(claims(fake, iat=None)),
            id='no-iat',
        ),
        pytest.param(
            lambda fake: fake.sign_id_token(claims(fake, email=None)),
            id='no-email',
        ),
        pytest.param(lambda fake: 'not.a.jwt', id='garbage'),
    ],
)
async def test_an_id_token_that_does_not_verify_is_rejected(
    client, fake_borderless, make
):
    with pytest.raises(BorderlessRejected):
        await client.verify_id_token(make(fake_borderless), NONCE)


async def test_the_audience_may_be_a_list_with_a_matching_azp(
    client, fake_borderless
):
    raw = fake_borderless.sign_id_token(
        claims(fake_borderless, aud=[CLIENT_ID, 'other'], azp=CLIENT_ID)
    )
    assert (await client.verify_id_token(raw, NONCE)).sub == USER


async def test_an_unknown_key_refetches_the_jwks_at_most_once_a_minute(
    client, fake_borderless, wire
):
    await client.verify_id_token(
        fake_borderless.sign_id_token(claims(fake_borderless)), NONCE
    )
    assert len(wire.to('/jwks')) == 1

    fake_borderless.rotate_key()
    rotated = fake_borderless.sign_id_token(claims(fake_borderless))

    # Within the minute: no second fetch, refused.
    with pytest.raises(BorderlessRejected):
        await client.verify_id_token(rotated, NONCE)
    assert len(wire.to('/jwks')) == 1

    # A minute later: one refetch finds the new key.
    client._jwks_at -= 61
    assert (await client.verify_id_token(rotated, NONCE)).sub == USER
    assert len(wire.to('/jwks')) == 2


# --------------------------------------------------------------------------
# The code exchange
# --------------------------------------------------------------------------


async def test_the_exchange_authenticates_and_proves_the_verifier(
    client, fake_borderless, wire
):
    grant = await client.exchange(
        await a_code(fake_borderless), VERIFIER, NONCE
    )

    [request] = wire.to('/oauth2/token')
    expected = base64.b64encode(f'{CLIENT_ID}:{CLIENT_SECRET}'.encode())
    assert request.headers['authorization'] == f'Basic {expected.decode()}'
    form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
    assert form == {
        'grant_type': 'authorization_code',
        'code': form['code'],
        'redirect_uri': REDIRECT,
        'code_verifier': VERIFIER,
    }
    assert grant.identity.sub == USER
    assert grant.access_token
    assert grant.refresh_token
    assert grant.expires_in == 3600


async def test_the_exchange_retries_once_on_a_5xx(
    client, fake_borderless, wire
):
    code = await a_code(fake_borderless)
    answers = iter([httpx.Response(502)])

    def flaky(request):
        if request.url.path.endswith('/oauth2/token'):
            return next(answers, None)
        return None

    wire.override = flaky
    grant = await client.exchange(code, VERIFIER, NONCE)

    assert grant.identity.sub == USER
    assert len(wire.to('/oauth2/token')) == 2


async def test_the_exchange_retries_once_on_a_timeout(
    client, fake_borderless, wire
):
    code = await a_code(fake_borderless)
    failures = [1]

    def slow_once(request):
        if request.url.path.endswith('/oauth2/token') and failures:
            failures.pop()
            raise httpx.ReadTimeout('slow', request=request)
        return None

    wire.override = slow_once
    assert (await client.exchange(code, VERIFIER, NONCE)).identity.sub == USER


async def test_the_exchange_down_twice_is_unavailable(client, wire):
    wire.override = (
        lambda request: httpx.Response(503)
        if request.url.path.endswith('/oauth2/token')
        else None
    )
    with pytest.raises(BorderlessUnavailable):
        await client.exchange('code', VERIFIER, NONCE)
    assert len(wire.to('/oauth2/token')) == 2


async def test_a_refused_exchange_is_rejected_without_a_retry(
    client, fake_borderless, wire
):
    code = await a_code(fake_borderless)
    with pytest.raises(BorderlessRejected):
        await client.exchange(code, 'w' * 43, NONCE)  # wrong verifier
    assert len(wire.to('/oauth2/token')) == 1


async def test_an_exchange_with_another_nonce_is_rejected(
    client, fake_borderless
):
    code = await a_code(fake_borderless)
    with pytest.raises(BorderlessRejected):
        await client.exchange(code, VERIFIER, 'another-nonce')


async def test_an_exchange_without_a_refresh_token_is_rejected(
    client, fake_borderless, wire
):
    code = await a_code(fake_borderless)

    def strip_refresh(request):
        if request.url.path.endswith('/oauth2/token'):
            answer = wire._inner.handler(request)
            body = answer.json()
            body.pop('refresh_token')
            return httpx.Response(200, json=body)
        return None

    wire.override = strip_refresh
    with pytest.raises(BorderlessRejected):
        await client.exchange(code, VERIFIER, NONCE)


# --------------------------------------------------------------------------
# The refresh grant
# --------------------------------------------------------------------------


async def test_a_refresh_answers_the_grant_and_its_identity(
    client, fake_borderless
):
    token = fake_borderless.issue_refresh_token(USER)
    fake_borderless.set_account(USER, membership='BASE')

    grant = await client.refresh(token, 1.0)

    assert grant.identity.sub == USER
    assert grant.identity.membership == 'BASE'
    assert grant.refresh_token not in (None, token)
    assert grant.expires_in == 3600


async def test_invalid_grant_ends_the_grant(client, fake_borderless):
    token = fake_borderless.issue_refresh_token(USER)
    fake_borderless.revoke_grants(USER)
    with pytest.raises(BorderlessGrantEnded):
        await client.refresh(token, 1.0)


@pytest.mark.parametrize(
    'answer',
    [
        httpx.Response(503),
        httpx.Response(429, headers={'Retry-After': '5'}),
        httpx.Response(401, json={'error': 'invalid_client'}),
        httpx.Response(400, json={'error': 'invalid_request'}),
    ],
)
async def test_any_other_refusal_is_unavailable_without_a_retry(
    client, fake_borderless, wire, answer
):
    token = fake_borderless.issue_refresh_token(USER)
    await client.discovery()
    wire.override = (
        lambda request: answer
        if request.url.path.endswith('/oauth2/token')
        else None
    )
    with pytest.raises(BorderlessUnavailable):
        await client.refresh(token, 1.0)
    assert len(wire.to('/oauth2/token')) == 1


async def test_a_slow_refresh_is_unavailable(client, fake_borderless, wire):
    token = fake_borderless.issue_refresh_token(USER)
    await client.discovery()

    def slow(request):
        if request.url.path.endswith('/oauth2/token'):
            raise httpx.ReadTimeout('slow', request=request)
        return None

    wire.override = slow
    with pytest.raises(BorderlessUnavailable):
        await client.refresh(token, 0.5)


def _slow_on(fake: FakeBorderless, suffix: str, seconds: float):
    """The fake behind a transport that answers ``suffix`` late."""
    inner = fake.transport()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(suffix):
            await asyncio.sleep(seconds)
        return inner.handler(request)

    return httpx.MockTransport(handler)


@pytest.mark.parametrize(
    'suffix', ['/.well-known/openid-configuration', '/jwks', '/oauth2/token']
)
async def test_the_whole_refresh_is_bounded_by_its_timeout(
    fake_borderless, suffix
):
    """A cold client (no cached discovery or keys): a slow discovery, a
    slow JWKS or a slow token endpoint all end at the timeout (AC15)."""
    token = fake_borderless.issue_refresh_token(USER)
    cold = BorderlessOidcClient(
        httpx.AsyncClient(transport=_slow_on(fake_borderless, suffix, 2.0))
    )

    started = time.monotonic()
    with pytest.raises(BorderlessUnavailable):
        await cold.refresh(token, 0.3)

    assert time.monotonic() - started < 1.0


async def test_a_failed_discovery_refetch_keeps_the_last_good_document(
    client, wire
):
    first = await client.discovery()
    client._discovery_at -= envs.BORDERLESS_DISCOVERY_TTL_SECONDS + 1
    wire.override = (
        lambda request: httpx.Response(503)
        if request.url.path.endswith('openid-configuration')
        else None
    )

    assert await client.discovery() is first
    assert await client.discovery() is first  # no refetch for a while
    assert len(wire.to('/.well-known/openid-configuration')) == 2

    # Once the retry delay is over it tries again.
    client._discovery_at -= borderless_oidc.DISCOVERY_RETRY_SECONDS + 1
    wire.override = None
    assert (await client.discovery()).issuer == BORDERLESS_ISSUER
    assert len(wire.to('/.well-known/openid-configuration')) == 3


async def test_a_refresh_without_a_new_refresh_token_keeps_the_old(
    client, fake_borderless, wire
):
    token = fake_borderless.issue_refresh_token(USER)

    def no_rotation(request):
        if request.url.path.endswith('/oauth2/token'):
            answer = wire._inner.handler(request)
            body = answer.json()
            body.pop('refresh_token')
            return httpx.Response(200, json=body)
        return None

    wire.override = no_rotation
    grant = await client.refresh(token, 1.0)
    assert grant.refresh_token is None


# --------------------------------------------------------------------------
# Revocation, best effort
# --------------------------------------------------------------------------


async def test_revoke_tells_borderless(client, fake_borderless, wire):
    token = fake_borderless.issue_refresh_token(USER)

    await client.revoke(token)

    [request] = wire.to('/oauth2/revoke')
    form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
    assert form == {'token': token, 'token_type_hint': 'refresh_token'}
    assert request.headers['authorization'].startswith('Basic ')
    assert fake_borderless.log['revokes'] == [
        {'sub': USER, 'token_type_hint': 'refresh_token', 'known': True}
    ]


@pytest.mark.parametrize('failure', ['status', 'network', 'no-endpoint'])
async def test_revoke_never_raises(client, wire, caplog, failure):
    def answer(request):
        if failure == 'no-endpoint' and request.url.path.endswith(
            'openid-configuration'
        ):
            doc = wire.fake.discovery()
            doc.pop('revocation_endpoint')
            return httpx.Response(200, json=doc)
        if request.url.path.endswith('/oauth2/revoke'):
            if failure == 'network':
                raise httpx.ConnectError('down', request=request)
            return httpx.Response(500)
        return None

    wire.override = answer
    with caplog.at_level(logging.WARNING, logger='app'):
        await client.revoke('secret-refresh-token')

    assert caplog.records
    assert all(
        'secret-refresh-token' not in record.getMessage()
        for record in caplog.records
    )


# --------------------------------------------------------------------------
# Nothing secret in a repr or a log
# --------------------------------------------------------------------------


async def test_no_secret_or_token_in_a_repr_or_a_log(
    client, fake_borderless, wire, caplog
):
    with caplog.at_level(logging.DEBUG, logger='app'):
        code = await a_code(fake_borderless)
        grant = await client.exchange(code, VERIFIER, NONCE)
        refreshed = await client.refresh(grant.refresh_token or '', 1.0)
        with pytest.raises(BorderlessRejected):
            await client.exchange(code, VERIFIER, NONCE)  # spent
        with pytest.raises(BorderlessGrantEnded):
            await client.refresh(grant.refresh_token or '', 1.0)  # reused
        await client.revoke(refreshed.refresh_token or '')

    secrets = [
        CLIENT_SECRET,
        code,
        VERIFIER,
        grant.access_token,
        grant.refresh_token or '',
        refreshed.access_token,
        refreshed.refresh_token or '',
    ]
    text = '\n'.join(record.getMessage() for record in caplog.records)
    assert caplog.records  # the refusals were logged ...
    for secret in secrets:
        assert secret not in text  # ... without a secret
        assert secret not in repr(grant)
        assert secret not in repr(refreshed)
    assert 'invalid_grant' in text  # the OAuth error is
