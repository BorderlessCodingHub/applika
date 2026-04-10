"""JWT token utilities and cookie management.

Access token: short-lived JWT in HTTP-only cookie (__access).
Refresh token: opaque UUID stored in Redis, referenced via HTTP-only
cookie (__refresh).
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict

import jwt
import redis.asyncio as redis
from fastapi import Response

from app.config.settings import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    envs,
)


class TokenPayload(TypedDict):
    sub: str
    kind: Literal['access']


def decode_token(token: str) -> TokenPayload:
    return jwt.decode(
        token, envs.JWT_SECRET, algorithms=[envs.JWT_ALGORITHM]
    )


def set_access_cookie(sub: str, response: Response):
    utc_now = datetime.now(timezone.utc)
    expires_dt = utc_now + timedelta(
        minutes=envs.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    max_age = envs.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    access_payload = {
        'sub': sub,
        'kind': 'access',
        'exp': expires_dt,
    }
    access_token = jwt.encode(
        access_payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM
    )
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=max_age,
        expires=expires_dt.strftime('%a, %d %b %Y %H:%M:%S GMT'),
    )


def clear_access_cookie(response: Response):
    response.delete_cookie(ACCESS_COOKIE_NAME)


# --- Refresh token (Redis-backed) ---

_REFRESH_PREFIX = 'refresh_token:'


def _refresh_key(token_id: str) -> str:
    return f'{_REFRESH_PREFIX}{token_id}'


async def create_refresh_token(
    user_id: int, redis_client: redis.Redis, response: Response
) -> str:
    """Generate a refresh token, store in Redis, set cookie."""
    token_id = str(uuid.uuid4())
    ttl_seconds = envs.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    await redis_client.set(
        _refresh_key(token_id),
        str(user_id),
        ex=ttl_seconds,
    )

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token_id,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=ttl_seconds,
    )
    return token_id


async def validate_refresh_token(
    token_id: str, redis_client: redis.Redis
) -> int | None:
    """Validate refresh token. Returns user_id if valid, else None."""
    user_id_str = await redis_client.get(_refresh_key(token_id))
    if user_id_str is None:
        return None
    return int(user_id_str)


async def revoke_refresh_token(
    token_id: str, redis_client: redis.Redis
) -> None:
    """Revoke a refresh token by deleting it from Redis."""
    await redis_client.delete(_refresh_key(token_id))


def clear_refresh_cookie(response: Response):
    response.delete_cookie(REFRESH_COOKIE_NAME)
