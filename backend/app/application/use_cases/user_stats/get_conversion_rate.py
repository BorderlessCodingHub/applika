from app.application.dto.statistic import StageConversionDTO
from app.application.use_cases.user_stats.stages import STAGES
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


def conversion_rate(total_applications: int, reached: int) -> float:
    """``reached`` as a percentage of ``total_applications``, 1 decimal."""
    if total_applications <= 0:
        return 0
    return round(reached / total_applications * 100, 1)


class UserConversionRateUseCase:
    """Per stage: distinct applications with at least one event of that
    stage, and the share of all in-scope applications they are (R-023)."""

    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    async def execute(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[StageConversionDTO]:
        total = await self.user_stats_repo.get_applications_count(
            user_id, cycle_id
        )
        reached = await self.user_stats_repo.count_applications_per_stage(
            user_id, cycle_id
        )
        return [
            StageConversionDTO(
                event_type=event_type,
                interview_type=interview_type,
                total_applications=reached.get((event_type, interview_type), 0),
                conversion_rate=conversion_rate(
                    total, reached.get((event_type, interview_type), 0)
                ),
            )
            for event_type, interview_type in STAGES
        ]
