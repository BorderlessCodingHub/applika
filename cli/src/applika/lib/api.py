from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import httpx

from applika.lib.session import (
    SessionData,
    SessionStore,
    expiry_from_access_token,
)


class ApiError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 1):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class AuthError(ApiError):
    pass


def require_session(store: SessionStore) -> SessionData:
    session = store.try_load()
    if not session:
        raise AuthError('Please run `applika login` first.')
    return session


@dataclass
class ApiClient:
    session: SessionData
    store: SessionStore
    transport: httpx.BaseTransport | None = None

    def __post_init__(self):
        parsed = urlparse(self.session.api_base_url)
        self.cookie_domain = parsed.hostname
        self.client = httpx.Client(
            base_url=self.session.api_base_url,
            transport=self.transport,
            timeout=30,
        )
        self._set_cookie('__access', self.session.access_token)
        self._set_cookie('__refresh', self.session.refresh_token)

    def close(self) -> None:
        self.client.close()

    def _set_cookie(self, name: str, value: str) -> None:
        self.client.cookies.set(
            name,
            value,
            domain=self.cookie_domain,
            path='/',
        )

    def _save_session(self) -> None:
        access_token = self.client.cookies.get(
            '__access',
            domain=self.cookie_domain,
            path='/',
        )
        refresh_token = self.client.cookies.get(
            '__refresh',
            domain=self.cookie_domain,
            path='/',
        )
        if not access_token or not refresh_token:
            self.store.clear()
            raise AuthError('Please run `applika login` again.')
        self.session = SessionData(
            api_base_url=self.session.api_base_url,
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires_at=expiry_from_access_token(access_token),
        )
        self.store.save(self.session)

    def _refresh(self) -> bool:
        response = self.client.get('/auth/refresh')
        if response.status_code != 200:
            self.store.clear()
            return False
        self._save_session()
        return True

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        retry: bool = True,
    ) -> httpx.Response:
        response = self.client.request(
            method,
            path,
            params=params,
            json=json,
        )
        if (
            response.status_code == 401
            and retry
            and not path.startswith('/auth/')
        ):
            if not self._refresh():
                raise AuthError('Please run `applika login` again.')
            return self.request(
                method,
                path,
                params=params,
                json=json,
                retry=False,
            )
        if response.is_error:
            detail = _extract_error_detail(response)
            error_cls = AuthError if response.status_code == 401 else ApiError
            raise error_cls(detail, response.status_code)
        return response

    def get_json(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> Any:
        return self.request('GET', path, params=params).json()

    def post_json(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request('POST', path, json=payload).json()

    def put_json(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request('PUT', path, json=payload).json()

    def logout(self) -> None:
        try:
            self.client.get('/auth/logout')
        finally:
            self.store.clear()


def create_session_from_exchange(
    api_base_url: str,
    payload: dict[str, Any],
) -> SessionData:
    expires_at = datetime.now(UTC) + timedelta(
        seconds=int(payload['access_expires_in'])
    )
    return SessionData(
        api_base_url=api_base_url.rstrip('/'),
        access_token=payload['access_token'],
        refresh_token=payload['refresh_token'],
        access_expires_at=expires_at.isoformat(),
    )


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f'API request failed with status {response.status_code}'
    detail = data.get('detail') if isinstance(data, dict) else None
    return detail or f'API request failed with status {response.status_code}'
