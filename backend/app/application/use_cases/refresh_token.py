import redis.asyncio as redis
from fastapi import HTTPException, Response, status

from app.application.services.github_service import GitHubService
from app.core.crypto import decrypt_token
from app.core.tokens import (
    clear_access_cookie,
    clear_refresh_cookie,
    revoke_refresh_token,
    set_access_cookie,
    validate_refresh_token,
)
from app.domain.repositories.user_repository import UserRepository


class RefreshTokenUseCase:
    def __init__(
        self,
        user_repo: UserRepository,
        gh_service: GitHubService,
        redis_client: redis.Redis,
    ):
        self.user_repo = user_repo
        self.gh_service = gh_service
        self.redis_client = redis_client

    async def execute(
        self, refresh_id: str | None, response: Response
    ) -> None:
        """Validate refresh token, verify GitHub token, re-issue
        access cookie. Raises HTTPException on failure."""
        if not refresh_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Not authenticated',
            )

        user_id = await validate_refresh_token(
            refresh_id, self.redis_client
        )
        if user_id is None:
            clear_access_cookie(response)
            clear_refresh_cookie(response)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid or expired refresh token',
            )

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            await revoke_refresh_token(
                refresh_id, self.redis_client
            )
            clear_access_cookie(response)
            clear_refresh_cookie(response)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='User not found',
            )

        if user.encrypted_github_token:
            github_token = decrypt_token(user.encrypted_github_token)
            if github_token:
                is_valid = await self.gh_service.validate_token(
                    user.id, github_token
                )
                if not is_valid:
                    await revoke_refresh_token(
                        refresh_id, self.redis_client
                    )
                    clear_access_cookie(response)
                    clear_refresh_cookie(response)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail='GitHub token revoked',
                    )

        set_access_cookie(str(user.github_id), response)
