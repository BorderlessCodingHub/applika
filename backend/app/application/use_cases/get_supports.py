from app.application.dto.support import PlatformDTO, SupportDTO
from app.domain.repositories.platform_repository import PlatformRepository


class GetSupportsUseCase:
    """The ``/supports`` lists: the platforms the user sees (the public
    ones and the user's own)."""

    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repository = platform_repo

    async def execute(self, user_id: int) -> SupportDTO:
        platforms = await self.platform_repository.list_visible(user_id)
        return SupportDTO(
            platforms=[PlatformDTO.model_validate(p) for p in platforms]
        )
