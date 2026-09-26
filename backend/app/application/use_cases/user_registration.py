from fastapi_sso import OpenID

from app.application.dto.user import UserCreateDTO, UserDTO
from app.config.logging import logger
from app.core.crypto import encrypt_token
from app.domain.repositories.user_repository import UserRepository


class UserRegistrationUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def execute(
        self,
        user: OpenID,
        github_token: str | None = None,
    ) -> UserDTO:
        # GitHub always sends an id; the SSO library's own type is
        # provider-agnostic (`str | None`), not GitHub-specific.
        assert user.id is not None

        existing_user = await self.user_repository.get_by_github_id(
            int(user.id)
        )
        if existing_user:
            if github_token:
                existing_user.encrypted_github_token = encrypt_token(
                    github_token
                )
            await self.user_repository.update(existing_user)

            logger.info(
                f'Returning user login: {existing_user.username}',
                extra={
                    'extra_data': {
                        'event': 'user_login',
                        'user_id': existing_user.id,
                        'github_id': user.id,
                    }
                },
            )
            return UserDTO.model_validate(existing_user)

        # Only a brand-new user needs these: GitHub's own profile always
        # carries a login and an email, but `_get_primary_email` (called
        # when the primary API response omits one) can genuinely return
        # `None` if GitHub's emails endpoint answers non-200 - narrowed
        # here, not at the top of `execute`, so that failure never breaks
        # a *returning* user's login (B5, backend-qa 2026-09-25).
        assert user.display_name is not None
        assert user.email is not None

        user_data = UserCreateDTO(
            github_id=int(user.id),
            username=user.display_name,
            email=user.email,
        )

        created_user = await self.user_repository.create(user_data)

        if github_token:
            created_user.encrypted_github_token = encrypt_token(github_token)
        await self.user_repository.update(created_user)

        logger.info(
            f'New user registered: {created_user.username}',
            extra={
                'extra_data': {
                    'event': 'user_registered',
                    'user_id': created_user.id,
                    'github_id': user.id,
                    'username': user.display_name,
                }
            },
        )
        return UserDTO.model_validate(created_user)
