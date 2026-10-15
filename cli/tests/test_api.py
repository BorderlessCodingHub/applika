import json
import platform
import re
from datetime import datetime, timedelta, timezone

import httpx
import pytest

import applika.lib.api as api_module
from applika.lib.api import ApiClient, ApiError, AuthError
from applika.lib.session import SessionData, SessionStore


def _session(access='old-access', refresh='refresh-token') -> SessionData:
    return SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token=access,
        refresh_token=refresh,
        access_expires_at='2026-05-08T10:00:00+00:00',
    )


def _token(access: str, refresh: str = 'refresh-token') -> dict:
    return {
        'access_token': access,
        'token_type': 'Bearer',
        'expires_in': 900,
        'refresh_token': refresh,
        'refresh_expires_in': 604800,
    }


def _client(tmp_path, handler, session=None):
    store = SessionStore(tmp_path / 'session.json')
    session = session or _session()
    store.save(session)
    client = ApiClient(session, store, transport=httpx.MockTransport(handler))
    return client, store


def test_sends_bearer_and_user_agent_and_never_a_cookie(tmp_path):
    """KODI-060 AC4: the access token goes in ``Authorization: Bearer``;
    a cookie the server sets is never stored nor sent back."""
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json=[],
            headers={'set-cookie': '__access=from-server; Path=/; HttpOnly'},
        )

    client, _ = _client(tmp_path, handler)
    try:
        client.get_json('/applications')
        client.get_json('/applications')
    finally:
        client.close()

    assert len(seen) == 2
    for request in seen:
        assert request.headers['authorization'] == 'Bearer old-access'
        assert 'cookie' not in request.headers
        assert re.fullmatch(
            r'applika-cli/\S+ \(.*\)', request.headers['user-agent']
        )
    assert f'({platform.system()})' in seen[0].headers['user-agent']


def test_user_agent_names_the_installed_version(monkeypatch):
    monkeypatch.setattr(api_module, 'installed_version', lambda: '1.1.0')
    monkeypatch.setattr(api_module.platform, 'system', lambda: 'Linux')

    assert api_module.user_agent() == 'applika-cli/1.1.0 (Linux)'


def test_api_client_refreshes_through_auth_token_and_retries(tmp_path):
    """A 401 on a route: one refresh grant on POST /auth/token, the new
    access token saved, the route retried once with the new Bearer."""
    state = {'applications_calls': 0, 'token_bodies': []}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/applications':
            state['applications_calls'] += 1
            if request.headers['authorization'] != 'Bearer new-access':
                return httpx.Response(401, json={'detail': 'Session expired'})
            return httpx.Response(200, json=[{'id': 1}])
        if request.url.path == '/api/auth/token' and request.method == 'POST':
            state['token_bodies'].append(json.loads(request.read()))
            return httpx.Response(200, json=_token('new-access'))
        raise AssertionError(f'Unexpected request: {request.url}')

    client, store = _client(tmp_path, handler)
    before = datetime.now(timezone.utc)
    try:
        data = client.get_json('/applications')
    finally:
        client.close()

    assert data == [{'id': 1}]
    assert state['applications_calls'] == 2
    assert state['token_bodies'] == [
        {'grant_type': 'refresh_token', 'refresh_token': 'refresh-token'}
    ]
    saved = store.load()
    assert saved.access_token == 'new-access'
    assert saved.refresh_token == 'refresh-token'
    expires = datetime.fromisoformat(saved.access_expires_at)
    assert before + timedelta(seconds=895) < expires
    assert expires < before + timedelta(seconds=905)


def test_second_401_after_refresh_is_an_auth_error(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/auth/token':
            return httpx.Response(200, json=_token('new-access'))
        return httpx.Response(401, json={'detail': 'Session expired'})

    client, _ = _client(tmp_path, handler)
    try:
        with pytest.raises(AuthError):
            client.get_json('/applications')
    finally:
        client.close()


@pytest.mark.parametrize(
    ('refresh_status', 'detail'),
    [
        (429, 'Too many requests. Try again in 30 seconds.'),
        (503, 'Session service unavailable. Try again in 30 seconds.'),
    ],
)
def test_refresh_refused_with_429_or_503_keeps_the_session(
    tmp_path, refresh_status, detail
):
    """KODI-040 + KODI-060 fail closed: a refresh refused with 429 or 503
    keeps session.json byte for byte and fails with ApiError (not
    AuthError), no wait, no retry."""
    state = {'refresh_calls': 0, 'applications_calls': 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/applications':
            state['applications_calls'] += 1
            return httpx.Response(401, json={'detail': 'Token expired'})
        if request.url.path == '/api/auth/token':
            state['refresh_calls'] += 1
            server_detail = (
                'Too many requests. Try again in 30 seconds.'
                if refresh_status == 429
                else 'Session service unavailable'
            )
            return httpx.Response(
                refresh_status,
                json={'detail': server_detail},
                headers={'retry-after': '30'},
            )
        raise AssertionError(f'Unexpected request: {request.url}')

    client, store = _client(tmp_path, handler)
    session_bytes_before = store.path.read_bytes()
    try:
        with pytest.raises(ApiError) as excinfo:
            client.get_json('/applications')
    finally:
        client.close()

    assert not isinstance(excinfo.value, AuthError)
    assert excinfo.value.status_code == refresh_status
    assert excinfo.value.detail == detail
    assert state['refresh_calls'] == 1
    assert state['applications_calls'] == 1
    assert store.path.read_bytes() == session_bytes_before


@pytest.mark.parametrize('refresh_status', [400, 401, 403, 422, 500, 502])
def test_other_refresh_failure_clears_the_session(tmp_path, refresh_status):
    """Any refresh answer other than 200, 429 and 503 ends the session with
    AuthError and removes session.json."""
    state = {'refresh_calls': 0, 'applications_calls': 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/applications':
            state['applications_calls'] += 1
            return httpx.Response(401, json={'detail': 'Session expired'})
        if request.url.path == '/api/auth/token':
            state['refresh_calls'] += 1
            return httpx.Response(
                refresh_status,
                json={'error': 'invalid_grant', 'detail': 'Invalid grant'},
            )
        raise AssertionError(f'Unexpected request: {request.url}')

    client, store = _client(tmp_path, handler)
    try:
        with pytest.raises(AuthError) as excinfo:
            client.get_json('/applications')
    finally:
        client.close()

    assert 'applika login' in excinfo.value.detail
    assert store.try_load() is None
    assert state['refresh_calls'] == 1
    assert state['applications_calls'] == 1


def test_refresh_200_without_tokens_clears_the_session(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/auth/token':
            return httpx.Response(200, json={'detail': 'ok'})
        return httpx.Response(401, json={'detail': 'Session expired'})

    client, store = _client(tmp_path, handler)
    try:
        with pytest.raises(AuthError):
            client.get_json('/applications')
    finally:
        client.close()

    assert store.try_load() is None


def test_503_on_a_route_keeps_the_session_and_does_not_refresh(tmp_path):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(
            503,
            json={'detail': 'Session service unavailable'},
            headers={'retry-after': '5'},
        )

    client, store = _client(tmp_path, handler)
    before = store.path.read_bytes()
    try:
        with pytest.raises(ApiError) as excinfo:
            client.get_json('/applications')
    finally:
        client.close()

    assert not isinstance(excinfo.value, AuthError)
    assert excinfo.value.status_code == 503
    assert excinfo.value.detail == (
        'Session service unavailable. Try again in 5 seconds.'
    )
    assert calls == ['/api/applications']
    assert store.path.read_bytes() == before


def test_retry_after_without_a_number_falls_back_to_five_seconds():
    response = httpx.Response(503, json={}, headers={'retry-after': 'soon'})

    assert api_module.retry_after_seconds(response) == 5
    assert api_module.error_detail(response) == (
        'API request failed with status 503. Try again in 5 seconds.'
    )


def test_a_1_0_1_session_file_loads_and_is_sent_as_bearer(tmp_path):
    """The session file keeps its four keys: a file 1.0.1 wrote loads in
    1.1.0, and the file 1.1.0 writes has exactly those keys."""
    path = tmp_path / 'session.json'
    path.write_text(
        '{\n'
        '  "access_expires_at": "2026-05-08T10:00:00+00:00",\n'
        '  "access_token": "legacy-access",\n'
        '  "api_base_url": "http://127.0.0.1:8000/api",\n'
        '  "refresh_token": "0190a3f2-legacy-refresh"\n'
        '}'
    )
    store = SessionStore(path)
    session = store.load()
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers['authorization'])
        return httpx.Response(200, json={'username': 'luis'})

    client = ApiClient(session, store, transport=httpx.MockTransport(handler))
    try:
        client.get_json('/users/me')
    finally:
        client.close()

    assert seen == ['Bearer legacy-access']
    store.save(
        api_module.session_from_token(
            'http://127.0.0.1:8000/api/', _token('a', 'r')
        )
    )
    written = json.loads(path.read_text())
    assert set(written) == {
        'api_base_url',
        'access_token',
        'refresh_token',
        'access_expires_at',
    }
    assert written['api_base_url'] == 'http://127.0.0.1:8000/api'


def test_logout_revokes_on_the_server_then_clears(tmp_path):
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/auth/revoke'
        assert request.method == 'POST'
        bodies.append(json.loads(request.read()))
        return httpx.Response(204)

    client, store = _client(tmp_path, handler)
    try:
        status = client.logout()
    finally:
        client.close()

    assert status == 204
    assert bodies == [{'refresh_token': 'refresh-token'}]
    assert store.try_load() is None


@pytest.mark.parametrize('status', [429, 503])
def test_logout_refused_with_429_or_503_keeps_the_session(tmp_path, status):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            json={'detail': 'Session service unavailable'},
            headers={'retry-after': '5'},
        )

    client, store = _client(tmp_path, handler)
    before = store.path.read_bytes()
    try:
        with pytest.raises(ApiError) as excinfo:
            client.logout()
    finally:
        client.close()

    assert excinfo.value.status_code == status
    assert store.path.read_bytes() == before


def test_logout_without_network_keeps_the_session(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('connection refused')

    client, store = _client(tmp_path, handler)
    try:
        with pytest.raises(ApiError) as excinfo:
            client.logout()
    finally:
        client.close()

    assert 'connection refused' in excinfo.value.detail
    assert store.try_load() is not None


@pytest.mark.parametrize('status', [400, 401, 422, 500])
def test_logout_other_answer_clears_and_reports_the_status(tmp_path, status):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={'detail': 'x'})

    client, store = _client(tmp_path, handler)
    try:
        assert client.logout() == status
    finally:
        client.close()

    assert store.try_load() is None


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


def test_session_from_token_uses_the_answers_expires_in():
    before = datetime.now(timezone.utc)
    payload = {
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 60,
    }

    session = api_module.session_from_token('http://x/api', payload)

    expires = datetime.fromisoformat(session.access_expires_at)
    assert before + timedelta(seconds=55) < expires
    assert expires < before + timedelta(seconds=65)
