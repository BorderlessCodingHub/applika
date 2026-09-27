from app.application.dto.platform import PlatformDTO
from app.domain.repositories.platform_repository import PlatformRepository


class ListPlatformsUseCase:
    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(
        self, user_id: int, name: str | None = None
    ) -> list[PlatformDTO]:
        """``GET /platforms`` (S7): public platforms plus the caller's own
        private ones (R-018), searched case-insensitively and ordered by
        name - the web platform picker. Never used by ``/supports``
        (R-036), which keeps its own ``ListVisible`` call unchanged."""
        platforms = await self.platform_repo.list_visible(
            user_id, name=name, order_by_name=True
        )
        return [PlatformDTO.model_validate(p) for p in platforms]
