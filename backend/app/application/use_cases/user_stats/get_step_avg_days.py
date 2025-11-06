from decimal import ROUND_HALF_UP, Decimal
from typing import List

from app.application.dto.statistic import AvarageDaysDTO
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


def format_decimal(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0"), rounding=ROUND_HALF_UP)

class GetAvgDaysPerStepUseCase:
    def __init__(self, user_stats_repo: UserStatsRepository):
        self.user_stats_repo = user_stats_repo

    async def execute(self, user_id: int) -> List[AvarageDaysDTO]:
        avg_days = await self.user_stats_repo.average_days_per_step(user_id)

        return [
            AvarageDaysDTO(
                id=step['step_id'],
                name=step['step_name'],
                color=step['step_color'],
                average_days=format_decimal(step['avg_days']),
            )
            for step in avg_days
        ]
