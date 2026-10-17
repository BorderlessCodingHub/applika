import platform
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar, DefaultCookiePolicy
from typing import Any

import httpx

from applika.commands.version import installed_version
from applika.lib.session import SessionData, SessionStore

REFRESH_TOKEN_GRANT = 'refresh_token'
# Answers that mean "try again later": the stored session is kept (fail
# closed, ADR-0019 / KODI-060).
TRANSIENT_STATUSES = (429, 503)
DEFAULT_RETRY_AFTER_SECONDS = 5


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


def user_agent() -> str:
    return f'applika-cli/{installed_version()} ({platform.system()})'


class _NoCookies(DefaultCookiePolicy):
    """1.1.0 authenticates with ``Authorization: Bearer`` only: a cookie
    the server sets is never stored and never sent back."""

    def set_ok(self, cookie, request) -> bool:
        return False

    def return_ok(self, cookie, request) -> bool:
        return False


def open_client(
    api_base_url: str,
    transport: httpx.BaseTransport | None = None,
    access_token: str | None = None,
) -> httpx.Client:
    """An httpx client with the CLI's User-Agent and no cookie jar; with
    ``access_token`` it also sends ``Authorization: Bearer``."""
    headers = {'User-Agent': user_agent()}
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    return httpx.Client(
        base_url=api_base_url,
        transport=transport,
        timeout=30,
        headers=headers,
        cookies=CookieJar(policy=_NoCookies()),
    )


@dataclass
class ApiClient:
    session: SessionData
    store: SessionStore
    transport: httpx.BaseTransport | None = None

    def __post_init__(self):
        self.client = open_client(
            self.session.api_base_url,
            self.transport,
            self.session.access_token,
        )

    def close(self) -> None:
        self.client.close()

    def _refresh(self) -> bool:
        """``POST /auth/token`` refresh grant. 429/503 keep the session and
        raise ``ApiError``; any other non-200 clears it (returns False)."""
        response = self.client.post(
            '/auth/token',
            json={
                'grant_type': REFRESH_TOKEN_GRANT,
                'refresh_token': self.session.refresh_token,
            },
        )
        if response.status_code in TRANSIENT_STATUSES:
            raise ApiError(error_detail(response), response.status_code)
        if response.status_code != 200:
            self.store.clear()
            return False
        try:
            self.session = session_from_token(
                self.session.api_base_url, response.json()
            )
        except (ValueError, KeyError, TypeError):
            self.store.clear()
            return False
        self.store.save(self.session)
        self.client.headers['Authorization'] = (
            f'Bearer {self.session.access_token}'
        )
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
            detail = error_detail(response)
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

    def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        """POST with an optional body. ``payload=None`` sends no body at
        all (no ``json`` kwarg reaches httpx, so no ``Content-Type`` header
        and no bytes go out) - used for the bodyless finalize/reopen close,
        which must be indistinguishable from a client that never heard of
        the outcome body."""
        return self.request('POST', path, json=payload).json()

    def put_json(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request('PUT', path, json=payload).json()

    def patch_json(self, path: str, payload: dict[str, Any]) -> Any:
        """PATCH with a body - the master CV's partial update (KODI-018)."""
        return self.request('PATCH', path, json=payload).json()

    def delete(self, path: str) -> None:
        self.request('DELETE', path)

    def fetch_raw(
        self,
        method: str,
        path: str,
    ) -> tuple[bytes, dict[str, str]]:
        """The response body as bytes plus its headers (KODI-018).

        The CV download routes answer ``application/pdf`` or
        ``text/markdown`` and carry the file name in ``Content-Disposition``,
        so a ``.json()`` helper cannot serve them. Additive: every existing
        method keeps its signature and its behaviour.
        """
        response = self.request(method, path)
        return response.content, dict(response.headers)

    def logout(self) -> int:
        """``POST /auth/revoke`` the stored refresh token, then clear the
        local session; returns the server's status.

        Fail closed (owner decision D1): a 429, a 503 or no answer at all
        means the server may still hold the session, so the local file is
        kept and ``ApiError`` is raised for the user to retry. Any other
        answer clears it (the value is no longer usable).
        """
        try:
            response = self.client.post(
                '/auth/revoke',
                json={'refresh_token': self.session.refresh_token},
            )
        except httpx.TransportError as exc:
            raise ApiError(f'Could not reach the server ({exc}).') from exc
        if response.status_code in TRANSIENT_STATUSES:
            raise ApiError(error_detail(response), response.status_code)
        self.store.clear()
        return response.status_code


def create_session_from_exchange(
    api_base_url: str,
    payload: dict[str, Any],
) -> SessionData:
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=int(payload['access_expires_in'])
    )
    return SessionData(
        api_base_url=api_base_url.rstrip('/'),
        access_token=payload['access_token'],
        refresh_token=payload['refresh_token'],
        access_expires_at=expires_at.isoformat(),
    )


def session_from_token(
    api_base_url: str,
    payload: dict[str, Any],
) -> SessionData:
    """The four-key session from a ``POST /auth/token`` answer; the file
    keeps the 1.0.1 shape so an older CLI can still read it."""
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=int(payload['expires_in'])
    )
    return SessionData(
        api_base_url=api_base_url.rstrip('/'),
        access_token=payload['access_token'],
        refresh_token=payload['refresh_token'],
        access_expires_at=expires_at.isoformat(),
    )


def retry_after_seconds(response: httpx.Response) -> int:
    try:
        return max(0, int(response.headers.get('retry-after', '')))
    except ValueError:
        return DEFAULT_RETRY_AFTER_SECONDS


def error_detail(response: httpx.Response) -> str:
    """The API's ``detail``; a 503 also says when to try again."""
    detail = _extract_error_detail(response)
    if response.status_code == 503:
        seconds = retry_after_seconds(response)
        detail = f'{detail.rstrip(".")}. Try again in {seconds} seconds.'
    return detail


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f'API request failed with status {response.status_code}'
    detail = data.get('detail') if isinstance(data, dict) else None
    return detail or f'API request failed with status {response.status_code}'
