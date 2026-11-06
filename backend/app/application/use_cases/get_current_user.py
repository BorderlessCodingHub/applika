from dataclasses import dataclass

import jwt

from app.application.dto.user import UserDTO
from app.application.services.session_store import SessionStore
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import InvalidSession
from app.core.tokens import decode_token
from app.domain.repositories.user_repository import UserRepository

SESSION_EXPIRED = 'Session expired'


@dataclass(frozen=True)
class AuthenticatedUser:
    user: UserDTO
    session_id: int


def _session_expired(reason: str) -> InvalidSession:
    logger.info(
        'Auth failed: session expired',
        extra={'extra_data': {'event': 'auth_failed', 'reason': reason}},
    )
    return InvalidSession(SESSION_EXPIRED, ErrorCode.AUTH_SESSION_EXPIRED)


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
            raise InvalidSession(
                'Not authenticated', ErrorCode.AUTH_NOT_AUTHENTICATED
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
            raise InvalidSession(
                'Token expired', ErrorCode.AUTH_TOKEN_EXPIRED
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
            raise InvalidSession(
                'Invalid token', ErrorCode.AUTH_INVALID_TOKEN
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
            raise InvalidSession(
                'Invalid token payload', ErrorCode.AUTH_INVALID_TOKEN_PAYLOAD
            )

        raw_sid = payload.get('sid')
        if not raw_sid or not str(raw_sid).isdigit():
            raise _session_expired('no_session_claim')
        session_id = int(raw_sid)

        session_user_id = await self.session_store.touch(session_id, ip)
        if session_user_id is None:
            raise _session_expired('session_gone')
        # ``sub`` is ``users.id`` (ADR-0024). A token minted before that
        # carried a GitHub id and never matches: the session ends.
        if not str(user_sub).isdigit() or session_user_id != int(user_sub):
            raise _session_expired('session_mismatch')

        user = await self.user_repository.get_by_id(session_user_id)
        if not user:
            logger.warning(
                f'Auth failed: user not found for id={user_sub}',
                extra={
                    'extra_data': {
                        'event': 'auth_failed',
                        'reason': 'user_not_found',
                        'user_id': user_sub,
                    }
                },
            )
            raise InvalidSession('User not found', ErrorCode.AUTH_USER_GONE)

        return AuthenticatedUser(
            user=UserDTO.model_validate(user), session_id=session_id
        )
