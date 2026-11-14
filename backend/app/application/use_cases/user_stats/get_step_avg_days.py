from decimal import ROUND_HALF_UP, Decimal

from app.application.dto.statistic import StageAverageDaysDTO
from app.application.use_cases.user_stats.stages import STAGES
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


def format_decimal(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.0'), rounding=ROUND_HALF_UP)


class GetAvgDaysPerStepUseCase:
    """Per stage: average days from ``application_date`` to the stage's
    events, 0 for a stage with none (R-023)."""

    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    async def execute(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[StageAverageDaysDTO]:
        averages = await self.user_stats_repo.average_days_per_stage(
            user_id, cycle_id
        )
        return [
            StageAverageDaysDTO(
                event_type=event_type,
                interview_type=interview_type,
                average_days=format_decimal(
                    averages.get((event_type, interview_type), Decimal(0))
                ),
            )
            for event_type, interview_type in STAGES
        ]
