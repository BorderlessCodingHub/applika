from app.core.exceptions import ResourseConflict
from app.domain.repositories.user_repository import UserRepository
from app.presentation.schemas.user import UserCreate, UserResponse


class RegisterUser:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def execute(self, user_data: UserCreate) -> UserResponse:
        existing = await self.user_repo.get_by_email(user_data.email)
        if existing:
            raise ResourseConflict("Email already in use.")
        user = await self.user_repo.create(user_data)
        return UserResponse.model_validate(user)
