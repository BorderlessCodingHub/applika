from dataclasses import dataclass

import jwt
from fastapi import HTTPException, status

from app.application.dto.user import UserDTO
from app.application.services.session_store import SessionStore
from app.config.logging import logger
from app.core.tokens import decode_token
from app.domain.repositories.user_repository import UserRepository

SESSION_EXPIRED = 'Session expired'


@dataclass(frozen=True)
class AuthenticatedUser:
    user: UserDTO
    session_id: int


def _session_expired(reason: str) -> HTTPException:
    logger.info(
        'Auth failed: session expired',
        extra={'extra_data': {'event': 'auth_failed', 'reason': reason}},
    )
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=SESSION_EXPIRED,
    )


class GetCurrentUserUseCase:
    """The session check on every signed-in request (KODI-057, ADR-0019).

    JWT first (bad or expired -> 401 as before); then the token's ``sid``
    must name a live session: no ``sid`` (a token minted before KODI-057),
    a session whose Redis key is gone, or one that belongs to another
    GitHub id -> 401 ``Session expired``. A store failure raises
    ``SessionServiceUnavailable`` (503): the request never goes through
    unchecked."""

    def __init__(
        self, user_repository: UserRepository, session_store: SessionStore
    ):
        self.user_repository = user_repository
        self.session_store = session_store

    async def execute(
        self, access_token: str | None, ip: str | None = None
    ) -> AuthenticatedUser:
        if not access_token:
            logger.warning(
                'Auth failed: no token provided',
                extra={
                    'extra_data': {
                        'event': 'auth_failed',
                        'reason': 'no_token',
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Not authenticated',
            )

        try:
            payload = decode_token(access_token)
        except jwt.ExpiredSignatureError as err:
            logger.info(
                'Auth failed: token expired',
                extra={
                    'extra_data': {
                        'event': 'auth_failed',
                        'reason': 'token_expired',
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Token expired',
            ) from err
        except jwt.InvalidTokenError as err:
            logger.warning(
                'Auth failed: invalid token',
                extra={
                    'extra_data': {
                        'event': 'auth_failed',
                        'reason': 'invalid_token',
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid token',
            ) from err

        user_sub = payload.get('sub')
        if not user_sub:
            logger.warning(
                'Auth failed: invalid token payload (no sub)',
                extra={
                    'extra_data': {
                        'event': 'auth_failed',
                        'reason': 'invalid_payload',
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid token payload',
            )

        raw_sid = payload.get('sid')
        if not raw_sid or not str(raw_sid).isdigit():
            raise _session_expired('no_session_claim')
        session_id = int(raw_sid)

        session_github_id = await self.session_store.touch(session_id, ip)
        if session_github_id is None:
            raise _session_expired('session_gone')
        if str(session_github_id) != str(user_sub):
            raise _session_expired('session_mismatch')

        user = await self.user_repository.get_by_github_id(int(user_sub))
        if not user:
            logger.warning(
                f'Auth failed: user not found for github_id={user_sub}',
                extra={
                    'extra_data': {
                        'event': 'auth_failed',
                        'reason': 'user_not_found',
                        'github_id': user_sub,
                    }
                },
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='User not found',
            )

        return AuthenticatedUser(
            user=UserDTO.model_validate(user), session_id=session_id
        )
