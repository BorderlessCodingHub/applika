from app.application.dto.platform import PlatformDTO
from app.config.logging import logger
from app.domain.repositories.platform_repository import (
    PlatformRepository,
)


class ListPlatformsUseCase:
    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(
        self, admin_id: int, visibility: str | None = None
    ) -> list[PlatformDTO]:
        logger.info(
            'Admin listed platforms',
            extra={
                'extra_data': {
                    'event': 'admin_list_platforms',
                    'admin_id': admin_id,
                    'visibility': visibility,
                }
            },
        )
        platforms = await self.platform_repo.get_all(visibility=visibility)
        return [
            PlatformDTO(
                id=p.id,
                created_at=p.created_at,
                updated_at=p.updated_at,
                name=p.name,
                url=p.url,
                is_public=p.is_public,
                created_by=p.created_by,
                created_by_username=(
                    p.created_by_user.username if p.created_by_user else None
                ),
            )
            for p in platforms
        ]
