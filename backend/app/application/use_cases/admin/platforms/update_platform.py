from app.application.dto.platform import (
    PlatformDTO,
    PlatformUpdateDTO,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.platform_repository import (
    PlatformRepository,
)


class UpdatePlatformUseCase:
    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(
        self,
        platform_id: int,
        data: PlatformUpdateDTO,
        admin_id: int,
    ) -> PlatformDTO:
        platform = await self.platform_repo.get_by_id(
            platform_id
        )
        if not platform:
            logger.warning(
                f'Admin update platform failed: {platform_id}',
                extra={'extra_data': {
                    'event': 'admin_update_platform_failed',
                    'reason': 'platform_not_found',
                    'platform_id': platform_id,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceNotFound('Platform not found')

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(platform, key, value)

        platform = await self.platform_repo.update(platform)

        logger.info(
            f'Admin updated platform: {platform_id}',
            extra={'extra_data': {
                'event': 'admin_update_platform',
                'platform_id': platform_id,
                'admin_id': admin_id,
                'fields_updated': list(update_data.keys()),
            }},
        )

        return PlatformDTO.model_validate(platform)
