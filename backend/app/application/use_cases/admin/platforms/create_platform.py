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
        self,
        data: PlatformCreateDTO,
        admin_id: int,
        admin_username: str | None = None,
    ) -> PlatformDTO:
        # Owner decision, 2026-09-25: the admin screens are the only place a
        # platform is created public at once (R-021/R-022); it still keeps
        # ``created_by`` (the admin who added it).
        platform = await self.platform_repo.create(
            name=data.name,
            url=data.url,
            is_public=True,
            created_by=admin_id,
        )

        logger.info(
            f'Admin created platform: {platform.name}',
            extra={
                'extra_data': {
                    'event': 'admin_create_platform',
                    'platform_id': platform.id,
                    'platform_name': platform.name,
                    'admin_id': admin_id,
                }
            },
        )

        return PlatformDTO(
            id=platform.id,
            created_at=platform.created_at,
            updated_at=platform.updated_at,
            name=platform.name,
            url=platform.url,
            is_public=platform.is_public,
            created_by=platform.created_by,
            created_by_username=admin_username,
        )
