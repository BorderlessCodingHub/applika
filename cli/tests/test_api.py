import base64
import json

import httpx
import pytest

from applika.lib.api import ApiClient, ApiError, AuthError
from applika.lib.session import SessionData, SessionStore


def _jwt_like(exp: int) -> str:
    header = (
        base64
        .urlsafe_b64encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
        .decode()
        .rstrip('=')
    )
    payload = (
        base64
        .urlsafe_b64encode(json.dumps({'exp': exp}).encode())
        .decode()
        .rstrip('=')
    )
    return f'{header}.{payload}.signature'


def test_api_client_refreshes_and_retries(tmp_path):
    state = {'applications_calls': 0}
    new_access = _jwt_like(1893456000)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/applications':
            state['applications_calls'] += 1
            access_cookie = request.headers.get('cookie', '')
            if f'__access={new_access}' not in access_cookie:
                return httpx.Response(401, json={'detail': 'Token expired'})
            return httpx.Response(200, json=[{'id': 1}])
        if request.url.path == '/api/auth/refresh':
            return httpx.Response(
                200,
                json={'detail': 'Token refreshed'},
                headers={
                    'set-cookie': f'__access={new_access}; Path=/; HttpOnly',
                },
            )
        raise AssertionError(f'Unexpected request: {request.url}')

    store = SessionStore(tmp_path / 'session.json')
    session = SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token='old-access',
        refresh_token='refresh-token',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )
    store.save(session)

    client = ApiClient(
        session,
        store,
        transport=httpx.MockTransport(handler),
    )
    try:
        data = client.get_json('/applications')
    finally:
        client.close()

    assert data == [{'id': 1}]
    saved = store.load()
    assert saved.access_token == new_access
    assert state['applications_calls'] == 2


def test_refresh_refused_with_429_keeps_the_session(tmp_path):
    """KODI-040: a session refresh refused with 429 must not clear the
    stored session. The command fails with the server's retry message
    (ApiError, not AuthError), no wait, no retry."""
    state = {'refresh_calls': 0, 'applications_calls': 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/applications':
            state['applications_calls'] += 1
            return httpx.Response(401, json={'detail': 'Token expired'})
        if request.url.path == '/api/auth/refresh':
            state['refresh_calls'] += 1
            return httpx.Response(
                429,
                json={'detail': 'Too many requests. Try again in 30 seconds.'},
                headers={'retry-after': '30'},
            )
        raise AssertionError(f'Unexpected request: {request.url}')

    store = SessionStore(tmp_path / 'session.json')
    session = SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token='old-access',
        refresh_token='refresh-token',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )
    store.save(session)
    session_bytes_before = (tmp_path / 'session.json').read_bytes()

    client = ApiClient(
        session,
        store,
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(ApiError) as excinfo:
            client.get_json('/applications')
    finally:
        client.close()

    assert not isinstance(excinfo.value, AuthError)
    assert excinfo.value.status_code == 429
    assert excinfo.value.detail == 'Too many requests. Try again in 30 seconds.'
    assert state['refresh_calls'] == 1
    assert state['applications_calls'] == 1
    session_bytes_after = (tmp_path / 'session.json').read_bytes()
    assert session_bytes_after == session_bytes_before


@pytest.mark.parametrize('refresh_status', [401, 403, 500, 503])
def test_refresh_refused_with_401_still_clears_the_session(
    tmp_path, refresh_status
):
    """Pins the unchanged path: any refresh failure other than 429 still
    ends the session with AuthError - including a 503, which (like 429)
    also means "retry later" but must not keep the session."""
    state = {'refresh_calls': 0, 'applications_calls': 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/applications':
            state['applications_calls'] += 1
            return httpx.Response(401, json={'detail': 'Token expired'})
        if request.url.path == '/api/auth/refresh':
            state['refresh_calls'] += 1
            return httpx.Response(
                refresh_status, json={'detail': 'Refresh token expired'}
            )
        raise AssertionError(f'Unexpected request: {request.url}')

    store = SessionStore(tmp_path / 'session.json')
    session = SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token='old-access',
        refresh_token='refresh-token',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )
    store.save(session)

    client = ApiClient(
        session,
        store,
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(AuthError):
            client.get_json('/applications')
    finally:
        client.close()

    assert store.try_load() is None
    assert state['refresh_calls'] == 1
    assert state['applications_calls'] == 1


def test_post_without_payload_sends_no_body(tmp_path):
    """KODI-013: a bodyless finalize/reopen close must send no bytes and no
    Content-Type - not even an empty ``{}`` - so it is indistinguishable
    from a client that never heard of the outcome body."""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['content'] = request.content
        captured['content_type'] = request.headers.get('content-type')
        return httpx.Response(
            200, json={'id': '1', 'finalized': True}, request=request
        )

    store = SessionStore(tmp_path / 'session.json')
    session = SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token='access',
        refresh_token='refresh',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )
    store.save(session)

    client = ApiClient(session, store, transport=httpx.MockTransport(handler))
    try:
        data = client.post('/applications/1/finalize')
    finally:
        client.close()

    assert data == {'id': '1', 'finalized': True}
    assert captured['content'] == b''
    assert captured['content_type'] is None
