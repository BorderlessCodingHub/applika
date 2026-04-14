from app.application.dto.platform import PlatformDTO
from app.config.logging import logger
from app.domain.repositories.platform_repository import (
    PlatformRepository,
)


class ListPlatformsUseCase:
    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(
        self, admin_id: int
    ) -> list[PlatformDTO]:
        logger.info(
            'Admin listed platforms',
            extra={'extra_data': {
                'event': 'admin_list_platforms',
                'admin_id': admin_id,
            }},
        )
        platforms = await self.platform_repo.get_all()
        return [
            PlatformDTO.model_validate(p) for p in platforms
        ]
