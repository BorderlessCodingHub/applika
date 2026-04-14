from app.application.dto.platform import (
    PlatformCreateDTO,
    PlatformDTO,
)
from app.config.logging import logger
from app.domain.repositories.platform_repository import (
    PlatformRepository,
)


class CreatePlatformUseCase:
    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(
        self, data: PlatformCreateDTO, admin_id: int
    ) -> PlatformDTO:
        platform = await self.platform_repo.create(
            **data.model_dump()
        )

        logger.info(
            f'Admin created platform: {platform.name}',
            extra={'extra_data': {
                'event': 'admin_create_platform',
                'platform_id': platform.id,
                'platform_name': platform.name,
                'admin_id': admin_id,
            }},
        )

        return PlatformDTO.model_validate(platform)
