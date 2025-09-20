from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict

from fastapi import Response
import jwt

from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs


class TokenPayload(TypedDict):
    sub: str
    kind: Literal['access', 'refresh']


def decode_token(token: str) -> TokenPayload:
    return jwt.decode(token, envs.JWT_SECRET, algorithms=[envs.JWT_ALGORITHM])


def set_cookies(sub: str, response: Response):
    utc_now = datetime.now(timezone.utc)

    access_payload = {
        "sub": sub,
        "kind": "access",
        "exp": utc_now + timedelta(minutes=envs.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    access_token = jwt.encode(
        access_payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM)
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=True if envs.ENVIRONMENT == "PROD" else False,
        samesite="lax"
    )

    max_age = envs.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    expires_dt = utc_now + timedelta(days=envs.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_payload = {
        "sub": sub,
        "kind": "refresh",
        "exp": expires_dt,
    }
    refresh_token = jwt.encode(
        refresh_payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM)
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=True if envs.ENVIRONMENT == "PROD" else False,
        samesite="lax",
        max_age=max_age,
        expires=expires_dt.strftime("%a, %d %b %Y %H:%M:%S GMT")
    )

def clear_cookies(response: Response):
    response.delete_cookie(ACCESS_COOKIE_NAME)
    response.delete_cookie(REFRESH_COOKIE_NAME)