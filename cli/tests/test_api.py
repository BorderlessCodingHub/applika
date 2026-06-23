import base64
import json

import httpx

from applika.lib.api import ApiClient
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
