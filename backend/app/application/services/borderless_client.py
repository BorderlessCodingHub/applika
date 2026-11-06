"""Borderless API client (ADR-0024).

The API checks a Borderless email and password from its own server and
reads the membership from the profile. Borderless answers (owner's probe,
2026-10-29):

- ``POST /api/auth/signin`` 200 → ``data.user.{id, email, name, username,
  emailVerified}``, ``data.token.accessToken`` (opaque), ``data.token
  .expiresIn`` (seconds, 604800). No refresh token.
- ``GET /api/users/profile`` (Bearer) → ``data.user.membership``.

Nothing here logs or ``repr``s a password or a token. ``data.user.github``
is never read.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config.logging import logger
from app.config.settings import envs
from app.core.enums import BadgeKey

_MEMBERSHIP_TO_BADGE = {
    'base': BadgeKey.BORDERLESS_BASE,
    'psp': BadgeKey.BORDERLESS_PSP,
}


class BorderlessError(Exception):
    """Base of every Borderless failure. Never carries a secret."""


class BorderlessNotConfigured(BorderlessError):
    """``BORDERLESS_API_URL`` or the token key is unset."""


class BorderlessInvalidCredentials(BorderlessError):
    """Borderless refused the email and password (401)."""


class BorderlessRateLimited(BorderlessError):
    """Borderless answered 429."""

    def __init__(self, retry_after: int) -> None:
        super().__init__('Borderless rate-limited the request')
        self.retry_after = retry_after


class BorderlessUnavailable(BorderlessError):
    """A timeout, a network error, a 5xx or an answer we cannot read."""


class BorderlessAccessRefused(BorderlessError):
    """Borderless refused the stored access token (401/403)."""


@dataclass(frozen=True)
class BorderlessSignIn:
    user_id: str
    email: str
    email_verified: bool
    name: str | None
    username: str | None
    access_token: str = field(repr=False)
    expires_in: int = 0


def parse_membership(body: Any) -> BadgeKey | None:
    """The badge for ``data.user.membership``, compared ignoring case.

    Reads that one path only; anything else, or no value, is ``None``.
    """
    if not isinstance(body, dict):
        return None
    data = body.get('data')
    user = data.get('user') if isinstance(data, dict) else None
    value = user.get('membership') if isinstance(user, dict) else None
    if not isinstance(value, str):
        return None
    return _MEMBERSHIP_TO_BADGE.get(value.strip().lower())


def _retry_after(response: httpx.Response) -> int:
    raw = response.headers.get('Retry-After', '')
    try:
        return min(max(1, int(float(raw))), 3600)
    except ValueError, OverflowError:
        return 60


def _parse_sign_in(body: Any) -> BorderlessSignIn:
    try:
        data = body['data']
        user = data['user']
        token = data['token']
        user_id = str(user['id'])
        access = token['accessToken']
        expires_in = int(token['expiresIn'])
        email = str(user['email'])
    except (KeyError, TypeError, ValueError) as exc:
        raise BorderlessUnavailable('Unexpected Borderless answer') from exc
    if not user_id or not isinstance(access, str) or not access:
        raise BorderlessUnavailable('Unexpected Borderless answer')
    name = user.get('name')
    username = user.get('username')
    return BorderlessSignIn(
        user_id=user_id,
        email=email,
        email_verified=user.get('emailVerified') is True,
        name=name if isinstance(name, str) else None,
        username=username if isinstance(username, str) else None,
        access_token=access,
        expires_in=max(0, expires_in),
    )


class BorderlessClient:
    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or envs.BORDERLESS_API_URL or '').rstrip('/')
        self.timeout = timeout or envs.BORDERLESS_TIMEOUT_SECONDS
        self._transport = transport

    def is_configured(self) -> bool:
        return bool(self.base_url and envs.BORDERLESS_TOKEN_ENCRYPTION_KEY)

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            transport=self._transport,
        )

    async def sign_in(self, email: str, password: str) -> BorderlessSignIn:
        """Check the credentials. One retry on a 5xx or a timeout."""
        if not self.is_configured():
            raise BorderlessNotConfigured('Borderless is not configured')
        for attempt in (1, 2):
            try:
                async with self._client(self.timeout) as client:
                    response = await client.post(
                        '/api/auth/signin',
                        json={'email': email, 'password': password},
                    )
            except httpx.HTTPError as exc:
                logger.warning(
                    f'Borderless sign-in failed ({type(exc).__name__}), '
                    f'attempt {attempt}'
                )
                continue
            status = response.status_code
            if status == 200:
                try:
                    body = response.json()
                except ValueError as exc:
                    raise BorderlessUnavailable(
                        'Unexpected Borderless answer'
                    ) from exc
                return _parse_sign_in(body)
            if status in (400, 401, 403, 404):
                raise BorderlessInvalidCredentials('Invalid credentials')
            if status == 429:
                raise BorderlessRateLimited(_retry_after(response))
            logger.warning(
                f'Borderless sign-in answered {status}, attempt {attempt}'
            )
            if status < 500:
                break
        raise BorderlessUnavailable('Borderless is unavailable')

    async def read_membership(
        self, access_token: str, timeout: float | None = None
    ) -> BadgeKey | None:
        """The badge from the profile. Raises ``BorderlessAccessRefused`` or
        ``BorderlessUnavailable``; no retry."""
        if not self.base_url:
            raise BorderlessUnavailable('Borderless is not configured')
        try:
            async with asyncio.timeout(timeout or self.timeout):
                async with self._client(timeout or self.timeout) as client:
                    response = await client.get(
                        '/api/users/profile',
                        headers={'Authorization': f'Bearer {access_token}'},
                    )
        except (httpx.HTTPError, TimeoutError) as exc:
            logger.warning(
                f'Borderless profile read failed ({type(exc).__name__})'
            )
            raise BorderlessUnavailable('Borderless is unavailable') from exc
        status = response.status_code
        if status in (401, 403):
            raise BorderlessAccessRefused('Borderless refused the access')
        if status != 200:
            logger.warning(f'Borderless profile read answered {status}')
            raise BorderlessUnavailable('Borderless is unavailable')
        try:
            body = response.json()
        except ValueError as exc:
            raise BorderlessUnavailable('Unexpected Borderless answer') from exc
        return parse_membership(body)
