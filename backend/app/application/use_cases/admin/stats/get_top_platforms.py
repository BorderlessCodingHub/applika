from app.application.dto.admin import TopPlatformStatDTO
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class GetTopPlatformsUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, admin_id: int
    ) -> list[TopPlatformStatDTO]:
        logger.info(
            'Admin fetched top platforms',
            extra={'extra_data': {
                'event': 'admin_get_top_platforms',
                'admin_id': admin_id,
            }},
        )
        rows = await self.admin_repo.get_top_platforms()
        return [TopPlatformStatDTO(**r) for r in rows]
