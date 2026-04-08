import jwt
from fastapi import HTTPException, status

from app.application.dto.user import UserDTO
from app.config.logging import logger
from app.core.tokens import decode_token
from app.domain.repositories.user_repository import UserRepository


class GetCurrentUserUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def execute(self, access_token: str | None) -> UserDTO:
        if not access_token:
            logger.warning(
                'Auth failed: no token provided',
                extra={'extra_data': {
                    'event': 'auth_failed',
                    'reason': 'no_token',
                }},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Not authenticated',
            )

        try:
            payload = decode_token(access_token)
        except jwt.ExpiredSignatureError:
            logger.info(
                'Auth failed: token expired',
                extra={'extra_data': {
                    'event': 'auth_failed',
                    'reason': 'token_expired',
                }},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Token expired',
            )
        except jwt.InvalidTokenError:
            logger.warning(
                'Auth failed: invalid token',
                extra={'extra_data': {
                    'event': 'auth_failed',
                    'reason': 'invalid_token',
                }},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid token',
            )

        user_sub = payload.get('sub')
        if not user_sub:
            logger.warning(
                'Auth failed: invalid token payload (no sub)',
                extra={'extra_data': {
                    'event': 'auth_failed',
                    'reason': 'invalid_payload',
                }},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid token payload',
            )

        user = await self.user_repository.get_by_github_id(int(user_sub))
        if not user:
            logger.warning(
                f'Auth failed: user not found for github_id={user_sub}',
                extra={'extra_data': {
                    'event': 'auth_failed',
                    'reason': 'user_not_found',
                    'github_id': user_sub,
                }},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='User not found',
            )

        return UserDTO.model_validate(user)
