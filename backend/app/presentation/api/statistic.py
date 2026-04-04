from typing import List

from fastapi import APIRouter

from app.application.use_cases.user_stats.get_conversion_rate import (
    UserConversionRateUseCase,
)
from app.application.use_cases.user_stats.get_general_statistics import (
    GeneralStatisticsUseCase,
)
from app.application.use_cases.user_stats.get_last_month_trends_stats import (
    GetLastMonthTrendsStatsUseCase,
)
from app.application.use_cases.user_stats.get_mode_stats import (
    GetModeStatsUseCase,
)
from app.application.use_cases.user_stats.get_platform_stats import (
    GetPlatformStatsUseCase,
)
from app.application.use_cases.user_stats.get_step_avg_days import (
    GetAvgDaysPerStepUseCase,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import CurrentUserDp, UserStatsRepositoryDp
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.statistic import (
    ApplicationsStatistics,
    ApplicationsTrend,
    AvarageDaysSteps,
    ModeApplications,
    PlarformApplications,
    StepConversionRate,
)

router = APIRouter(
    prefix='/applications',
    tags=['Applications Statistics'],
    responses={'403': {'model': DetailSchema}},
)


def _cid(cycle_id: SnowflakeID | None) -> int | None:
    return int(cycle_id) if cycle_id else None


@router.get('/statistics', response_model=ApplicationsStatistics)
async def statistics(
    c_user: CurrentUserDp,
    user_stats_repo: UserStatsRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = GeneralStatisticsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id, _cid(cycle_id))


@router.get(
    '/statistics/steps/conversion_rate',
    response_model=List[StepConversionRate],
)
async def step_conversion_rate(
    c_user: CurrentUserDp,
    user_stats_repo: UserStatsRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = UserConversionRateUseCase(user_stats_repo)
    return await use_case.execute(c_user.id, _cid(cycle_id))


@router.get(
    '/statistics/steps/avarage_days', response_model=List[AvarageDaysSteps]
)
async def step_avarage_day(
    c_user: CurrentUserDp,
    user_stats_repo: UserStatsRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = GetAvgDaysPerStepUseCase(user_stats_repo)
    return await use_case.execute(c_user.id, _cid(cycle_id))


@router.get('/statistics/platforms', response_model=List[PlarformApplications])
async def plarform_applications(
    c_user: CurrentUserDp,
    user_stats_repo: UserStatsRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = GetPlatformStatsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id, _cid(cycle_id))


@router.get('/statistics/mode', response_model=ModeApplications)
async def mode_applications(
    c_user: CurrentUserDp,
    user_stats_repo: UserStatsRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = GetModeStatsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id, _cid(cycle_id))


@router.get('/statistics/trends', response_model=List[ApplicationsTrend])
async def applications_trend(
    c_user: CurrentUserDp,
    user_stats_repo: UserStatsRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = GetLastMonthTrendsStatsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id, _cid(cycle_id))
