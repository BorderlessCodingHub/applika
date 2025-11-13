from typing import List

from app.application.dto.statistic import StepConversionDTO
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


class UserConversionRateUseCase:
    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    def _c_rate(self, total_applications: int, step_applications: int):
        return (
            round((step_applications / total_applications * 100), 1)
            if total_applications > 0
            else 0
        )

    async def execute(self, user_id: int) -> List[StepConversionDTO]:
        total_a = await self.user_stats_repo.get_applications_count(user_id)
        steps = (
            await self.user_stats_repo.count_applications_per_step(
                user_id
            )
        )

        return [
            StepConversionDTO(
                id=step['step_id'],
                name=step['step_name'],
                color=step['step_color'],
                total_applications=step['count'],
                conversion_rate=self._c_rate(total_a, step['count']),
            )
            for step in steps
        ]
