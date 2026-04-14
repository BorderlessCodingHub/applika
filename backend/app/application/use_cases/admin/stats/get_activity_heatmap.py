from app.application.dto.admin import (
    ActivityHeatmapPointDTO,
)
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class GetActivityHeatmapUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, admin_id: int
    ) -> list[ActivityHeatmapPointDTO]:
        logger.info(
            'Admin fetched activity heatmap',
            extra={'extra_data': {
                'event': 'admin_get_activity_heatmap',
                'admin_id': admin_id,
            }},
        )
        rows = await self.admin_repo.get_activity_heatmap()
        return [ActivityHeatmapPointDTO(**r) for r in rows]
