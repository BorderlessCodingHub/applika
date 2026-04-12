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
        is_org_member: bool = False,
    ) -> UserDTO:
        existing_user = await self.user_repository.get_by_github_id(
            int(user.id)
        )
        if existing_user:
            if github_token:
                existing_user.encrypted_github_token = encrypt_token(
                    github_token
                )
            existing_user.is_org_member = is_org_member
            await self.user_repository.update(existing_user)

            logger.info(
                f'Returning user login: {existing_user.username}',
                extra={'extra_data': {
                    'event': 'user_login',
                    'user_id': existing_user.id,
                    'github_id': user.id,
                    'is_org_member': is_org_member,
                }},
            )
            return UserDTO.model_validate(existing_user)

        user_data = UserCreateDTO(
            github_id=int(user.id),
            username=user.display_name,
            email=user.email,
        )

        created_user = await self.user_repository.create(user_data)

        if github_token:
            created_user.encrypted_github_token = encrypt_token(
                github_token
            )
        created_user.is_org_member = is_org_member
        await self.user_repository.update(created_user)

        logger.info(
            f'New user registered: {created_user.username}',
            extra={'extra_data': {
                'event': 'user_registered',
                'user_id': created_user.id,
                'github_id': user.id,
                'username': user.display_name,
                'is_org_member': is_org_member,
            }},
        )
        return UserDTO.model_validate(created_user)
