"""``BorderlessClient`` against a mocked transport: nobody calls the real
Borderless. Response shapes follow the owner's probe (2026-10-29)."""

import logging

import httpx
import pytest

from app.application.services.borderless_client import (
    BorderlessAccessRefused,
    BorderlessClient,
    BorderlessInvalidCredentials,
    BorderlessNotConfigured,
    BorderlessRateLimited,
    BorderlessSignIn,
    BorderlessUnavailable,
    parse_membership,
)
from app.config.settings import envs
from app.core.enums import BadgeKey

PASSWORD = 'pa55-W0rd-never-logged'
TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'

SIGNIN_BODY = {
    'data': {
        'user': {
            'id': 'bl-123',
            'email': 'ada@example.com',
            'name': 'Ada Lovelace',
            'username': 'ada',
            'emailVerified': True,
        },
        'token': {'accessToken': TOKEN, 'expiresIn': 604800},
    }
}


def _client(handler) -> BorderlessClient:
    return BorderlessClient(
        base_url='http://borderless.test',
        timeout=1,
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_sign_in_parses_user_and_token():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen['path'] = request.url.path
        seen['body'] = request.content
        return httpx.Response(200, json=SIGNIN_BODY)

    result = await _client(handler).sign_in('ada@example.com', PASSWORD)

    assert seen['path'] == '/api/auth/signin'
    assert result == BorderlessSignIn(
        user_id='bl-123',
        email='ada@example.com',
        email_verified=True,
        name='Ada Lovelace',
        username='ada',
        access_token=TOKEN,
        expires_in=604800,
    )
    assert TOKEN not in repr(result)


@pytest.mark.asyncio
async def test_sign_in_unverified_email_is_reported():
    body = {'data': {**SIGNIN_BODY['data']}}
    body['data']['user'] = {**SIGNIN_BODY['data']['user'], 'emailVerified': False}
    result = await _client(lambda r: httpx.Response(200, json=body)).sign_in(
        'ada@example.com', PASSWORD
    )
    assert result.email_verified is False


@pytest.mark.asyncio
@pytest.mark.parametrize('status', [400, 401, 403, 404])
async def test_sign_in_refusal_is_invalid_credentials(status):
    with pytest.raises(BorderlessInvalidCredentials):
        await _client(lambda r: httpx.Response(status)).sign_in(
            'ada@example.com', PASSWORD
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('header', 'expected'), [('42', 42), ('abc', 60), (None, 60)]
)
async def test_sign_in_429_carries_retry_after(header, expected):
    headers = {'Retry-After': header} if header else {}
    with pytest.raises(BorderlessRateLimited) as excinfo:
        await _client(lambda r: httpx.Response(429, headers=headers)).sign_in(
            'ada@example.com', PASSWORD
        )
    assert excinfo.value.retry_after == expected


@pytest.mark.asyncio
async def test_sign_in_5xx_is_retried_once_then_unavailable():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(502)

    with pytest.raises(BorderlessUnavailable):
        await _client(handler).sign_in('ada@example.com', PASSWORD)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_sign_in_5xx_then_200_succeeds():
    answers = [httpx.Response(503), httpx.Response(200, json=SIGNIN_BODY)]
    result = await _client(lambda r: answers.pop(0)).sign_in(
        'ada@example.com', PASSWORD
    )
    assert result.user_id == 'bl-123'


@pytest.mark.asyncio
async def test_sign_in_timeout_is_retried_once_then_unavailable():
    calls = []

    def handler(request):
        calls.append(1)
        raise httpx.ReadTimeout('slow', request=request)

    with pytest.raises(BorderlessUnavailable):
        await _client(handler).sign_in('ada@example.com', PASSWORD)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_sign_in_other_4xx_is_unavailable_without_retry():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(418)

    with pytest.raises(BorderlessUnavailable):
        await _client(handler).sign_in('ada@example.com', PASSWORD)
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'response',
    [
        httpx.Response(200, text='not json'),
        httpx.Response(200, json={'data': {}}),
        httpx.Response(
            200,
            json={
                'data': {
                    'user': {'id': '', 'email': 'a@b.c'},
                    'token': {'accessToken': TOKEN, 'expiresIn': 1},
                }
            },
        ),
    ],
)
async def test_sign_in_unreadable_answer_is_unavailable(response):
    with pytest.raises(BorderlessUnavailable):
        await _client(lambda r: response).sign_in('ada@example.com', PASSWORD)


@pytest.mark.asyncio
async def test_sign_in_not_configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', None)
    client = _client(lambda r: httpx.Response(200, json=SIGNIN_BODY))
    assert client.is_configured() is False
    with pytest.raises(BorderlessNotConfigured):
        await client.sign_in('ada@example.com', PASSWORD)


@pytest.mark.asyncio
async def test_password_and_token_never_reach_the_logs(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.DEBUG)
    answers = [httpx.Response(500), httpx.Response(200, json=SIGNIN_BODY)]
    await _client(lambda r: answers.pop(0)).sign_in('ada@example.com', PASSWORD)
    with pytest.raises(BorderlessUnavailable):
        await _client(lambda r: httpx.Response(500)).read_membership(TOKEN)
    assert PASSWORD not in caplog.text
    assert TOKEN not in caplog.text


@pytest.mark.asyncio
async def test_read_membership_sends_bearer_and_parses():
    seen = {}

    def handler(request):
        seen['auth'] = request.headers['Authorization']
        seen['path'] = request.url.path
        return httpx.Response(
            200, json={'data': {'user': {'membership': 'PSP'}}}
        )

    assert await _client(handler).read_membership(TOKEN) is (
        BadgeKey.BORDERLESS_PSP
    )
    assert seen == {'auth': f'Bearer {TOKEN}', 'path': '/api/users/profile'}


@pytest.mark.asyncio
@pytest.mark.parametrize('status', [401, 403])
async def test_read_membership_refused(status):
    with pytest.raises(BorderlessAccessRefused):
        await _client(lambda r: httpx.Response(status)).read_membership(TOKEN)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'response',
    [httpx.Response(429), httpx.Response(500), httpx.Response(200, text='x')],
)
async def test_read_membership_unavailable(response):
    with pytest.raises(BorderlessUnavailable):
        await _client(lambda r: response).read_membership(TOKEN)


@pytest.mark.asyncio
async def test_read_membership_timeout_is_unavailable():
    def handler(request):
        raise httpx.ConnectTimeout('slow', request=request)

    with pytest.raises(BorderlessUnavailable):
        await _client(handler).read_membership(TOKEN, timeout=0.5)


@pytest.mark.asyncio
async def test_read_membership_without_url_is_unavailable():
    client = BorderlessClient(base_url='', timeout=1)
    client.base_url = ''
    with pytest.raises(BorderlessUnavailable):
        await client.read_membership(TOKEN)


@pytest.mark.parametrize(
    ('body', 'expected'),
    [
        ({'data': {'user': {'membership': 'PSP'}}}, BadgeKey.BORDERLESS_PSP),
        ({'data': {'user': {'membership': 'psp'}}}, BadgeKey.BORDERLESS_PSP),
        ({'data': {'user': {'membership': 'Base'}}}, BadgeKey.BORDERLESS_BASE),
        ({'data': {'user': {'membership': 'FREE'}}}, None),
        ({'data': {'user': {'membership': None}}}, None),
        ({'data': {'user': {}}}, None),
        ({'data': {'membership': 'PSP'}}, None),
        ({'membership': 'PSP'}, None),
        ({'data': {'user': {'github': 'PSP'}}}, None),
        ({'data': 'x'}, None),
        ([], None),
    ],
)
def test_parse_membership_reads_data_user_membership_only(body, expected):
    assert parse_membership(body) is expected


def test_parse_membership_never_reads_the_github_field():
    class Guard(dict):
        def get(self, key, default=None):
            assert key != 'github'
            return super().get(key, default)

    body = {'data': {'user': Guard(membership='PSP', github='octocat')}}
    assert parse_membership(body) is BadgeKey.BORDERLESS_PSP
