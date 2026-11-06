"""JWT access token and the session cookies (ADR-0002, ADR-0019).

Access token: a short-lived JWT, ``{sub: users.id, sid: <session id>,
kind: 'access', exp}``. The web carries it in the HTTP-only ``__access``
cookie; ``applika-cli`` 1.1.0 and later send it as ``Authorization: Bearer``.
``sid`` is the public ``user_sessions.id`` (a snowflake, as a string), never
the refresh value.

Refresh value: a random UUIDv7, the key of the session in Redis
(``app/application/services/session_store.py``). The web carries it in the
HTTP-only ``__refresh`` cookie.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal, NotRequired, TypedDict, cast

import jwt
from fastapi import Response

from app.config.settings import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    envs,
)


class TokenPayload(TypedDict):
    sub: str
    kind: Literal['access']
    # Absent from every token minted before KODI-057: such a token is
    # refused with 401 "Session expired".
    sid: NotRequired[str]


def decode_token(token: str) -> TokenPayload:
    payload = jwt.decode(
        token, envs.JWT_SECRET, algorithms=[envs.JWT_ALGORITHM]
    )
    return cast(TokenPayload, payload)


def create_access_token(
    sub: str,
    sid: str,
) -> tuple[str, datetime, int]:
    utc_now = datetime.now(UTC)
    expires_dt = utc_now + timedelta(minutes=envs.ACCESS_TOKEN_EXPIRE_MINUTES)
    max_age = envs.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    access_payload = {
        'sub': sub,
        'sid': sid,
        'kind': 'access',
        'exp': expires_dt,
    }
    access_token = jwt.encode(
        access_payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM
    )
    return access_token, expires_dt, max_age


def set_access_cookie(sub: str, sid: str, response: Response) -> None:
    access_token, expires_dt, max_age = create_access_token(sub, sid)
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=max_age,
        expires=expires_dt.strftime('%a, %d %b %Y %H:%M:%S GMT'),
    )


def clear_access_cookie(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME)


def set_refresh_cookie(
    refresh_value: str,
    ttl_seconds: int,
    response: Response,
) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_value,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=ttl_seconds,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME)
