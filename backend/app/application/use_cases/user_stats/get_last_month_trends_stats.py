from typing import List

from app.application.dto.statistic import ApplicationsTrendDTO
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


class GetLastMonthTrendsStatsUseCase:
    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    async def execute(self, user_id: int) -> List[ApplicationsTrendDTO]:
        applications = (
            await self.user_stats_repo.count_applications_per_day_last_month(
                user_id
            )
        )

        return [
            ApplicationsTrendDTO(
                application_date=app['application_date'],
                total_applications=app['count'],
            )
            for app in applications
        ]
