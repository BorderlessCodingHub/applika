from app.domain.models import UserModel
from app.domain.repositories.user_repository import UserRepository


class UnlinkDiscordUseCase:
    """Disconnect Discord (T032). Idempotent, and never calls Discord: there
    is no token to revoke here - revocation already happened at connect
    time (R-004)."""

    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def execute(self, user_id: int) -> UserModel | None:
        return await self.user_repo.unlink_discord(user_id)
