from app.application.dto.statistic import GeneralStatsDTO
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


class GeneralStatisticsUseCase:
    def __init__(self, stats_repo: UserStatsRepository):
        self.stats_repo = stats_repo

    async def execute(self, user_id: int) -> GeneralStatsDTO:
        result = GeneralStatsDTO()
        total_a = await self.stats_repo.get_applications_count(user_id)
        stricts = await self.stats_repo.count_applications_per_strict_step(
            user_id
        )

        result.total_applications = total_a
        for strict in stricts:
            if strict['step_name'].lower() == 'offer':
                result.offers = strict['count']
                result.success_rate = (
                    round((strict['count'] / total_a * 100), 1)
                    if total_a > 0
                    else 0
                )
            elif strict['step_name'].lower() == 'denied':
                result.denials = strict['count']
        return result
