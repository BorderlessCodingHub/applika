from fastapi_sso import OpenID

from app.application.dto.user import UserCreateDTO, UserDTO
from app.domain.repositories.user_repository import UserRepository


class UserRegistrationUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def execute(self, user: OpenID) -> UserDTO:
        existing_user = await self.user_repository.get_by_github_id(
            int(user.id)
        )
        if existing_user:
            return UserDTO.model_validate(existing_user)

        user_data = UserCreateDTO(
            github_id=int(user.id),
            username=user.display_name,
            email=user.email,
        )

        created_user = await self.user_repository.create(user_data)
        return UserDTO.model_validate(created_user)
