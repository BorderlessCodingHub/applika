from typing import List

from app.application.dto.statistic import PlarformAppDTO
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


class GetPlatformStatsUseCase:
    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    async def execute(self, user_id: int) -> List[PlarformAppDTO]:
        a_platform = (
            await self.user_stats_repo.count_applications_grouped_by_platform(
                user_id
            )
        )

        return [
            PlarformAppDTO(
                id=step['platform_id'],
                name=step['platform_name'],
                total_applications=step['count'],
            )
            for step in a_platform
        ]
