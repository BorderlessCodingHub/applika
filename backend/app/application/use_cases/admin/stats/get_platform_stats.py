from app.application.dto.admin import PlatformStatsDTO
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class GetPlatformStatsUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, admin_id: int
    ) -> PlatformStatsDTO:
        logger.info(
            'Admin fetched platform stats',
            extra={'extra_data': {
                'event': 'admin_get_platform_stats',
                'admin_id': admin_id,
            }},
        )
        data = await self.admin_repo.get_platform_stats()
        return PlatformStatsDTO(**data)
