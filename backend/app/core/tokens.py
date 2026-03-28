from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict

import jwt
from fastapi import Response

from app.config.settings import ACCESS_COOKIE_NAME, envs


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
