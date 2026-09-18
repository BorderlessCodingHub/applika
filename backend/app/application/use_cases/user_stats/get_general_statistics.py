from app.application.dto.statistic import GeneralStatsDTO
from app.application.use_cases.user_stats.get_conversion_rate import (
    conversion_rate,
)
from app.core.enums import EventType
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)


class GeneralStatisticsUseCase:
    """Totals for the dashboard (R-022).

    Offers and denials are the applications with at least one offer or
    denied event, counted independently: an application with both counts
    in both. The success rate is offers over all applications. Keyed on the
    event type, no longer on the "Offer"/"Denied" step names.
    """

    def __init__(self, stats_repo: UserStatsRepository):
        self.stats_repo = stats_repo

    async def execute(
        self, user_id: int, cycle_id: int | None = None
    ) -> GeneralStatsDTO:
        total = await self.stats_repo.get_applications_count(user_id, cycle_id)
        reached = await self.stats_repo.count_applications_per_stage(
            user_id, cycle_id
        )
        offers = reached.get((EventType.OFFER, None), 0)
        denials = reached.get((EventType.DENIED, None), 0)
        return GeneralStatsDTO(
            denials=denials,
            offers=offers,
            success_rate=conversion_rate(total, offers),
            total_applications=total,
        )
