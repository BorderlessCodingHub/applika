from app.application.dto.statistic import ModeAppDTO
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


class GetModeStatsUseCase:
    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    async def execute(self, user_id: int) -> ModeAppDTO:
        a_mode = await self.user_stats_repo.count_applications_grouped_by_mode(
            user_id
        )

        result = ModeAppDTO()
        for mode in a_mode:
            if mode['mode'] == 'active':
                result.active = mode['count']
            elif mode['mode'] == 'passive':
                result.passive = mode['count']
        return result
