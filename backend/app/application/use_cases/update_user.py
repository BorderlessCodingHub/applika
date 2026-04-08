from app.application.dto.user import UserDTO, UserUpdateDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.user_repository import UserRepository


class UpdateUserUseCase:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def execute(self, user_id: int, data: UserUpdateDTO) -> UserDTO:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise ResourceNotFound('User not found')

        update_data = data.model_dump(exclude_unset=True)

        if update_data.get("experience_years", 0) is None:
            update_data["experience_years"] = 0
        if update_data.get("current_salary", 0) is None:
            update_data["current_salary"] = 0

        for field, value in update_data.items():
            if field == 'tech_stack':
                user.tech_stack = value
            else:
                setattr(user, field, value)

        user = await self.user_repo.update(user)
        return UserDTO.model_validate(user)
