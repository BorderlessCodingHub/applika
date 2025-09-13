from app.domain.repositories.user_repository import UserRepository
from app.presentation.schemas.user import UserResponse


class GetUserByEmail:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def execute(self, email: str) -> UserResponse | None:
        user = await self.user_repo.get_by_email(email)
        if user:
            return UserResponse.model_validate(user)
        return None
