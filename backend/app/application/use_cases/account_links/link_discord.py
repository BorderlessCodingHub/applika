from app.domain.models import UserModel
from app.domain.repositories.user_repository import UserRepository


class LinkDiscordUseCase:
    """Link a Discord id to an Applika user (T016). The conflict and no-op
    rules live in the repository (T012, T026)."""

    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def execute(self, user_id: int, discord_id: int) -> UserModel:
        return await self.user_repo.link_discord(user_id, discord_id)
