from typing import List

from fastapi import APIRouter

from app.application.use_cases.get_conversion_rate import (
    UserConversionRateUseCase,
)
from app.application.use_cases.get_general_statistics import (
    GeneralStatisticsUseCase,
)
from app.application.use_cases.get_last_month_trends_stats import (
    GetLastMonthTrendsStatsUseCase,
)
from app.application.use_cases.get_mode_stats import GetModeStatsUseCase
from app.application.use_cases.get_platform_stats import (
    GetPlatformStatsUseCase,
)
from app.application.use_cases.get_step_avg_days import (
    GetAvgDaysPerStepUseCase,
)
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


@router.get('/statistics', response_model=ApplicationsStatistics)
async def statistics(
    c_user: CurrentUserDp, user_stats_repo: UserStatsRepositoryDp
):
    use_case = GeneralStatisticsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id)


@router.get(
    '/statistics/steps/conversion_rate',
    response_model=List[StepConversionRate],
)
async def step_conversion_rate(
    c_user: CurrentUserDp, user_stats_repo: UserStatsRepositoryDp
):
    use_case = UserConversionRateUseCase(user_stats_repo)
    return await use_case.execute(c_user.id)


@router.get(
    '/statistics/steps/avarage_days', response_model=List[AvarageDaysSteps]
)
async def step_avarage_day(
    c_user: CurrentUserDp, user_stats_repo: UserStatsRepositoryDp
):
    use_case = GetAvgDaysPerStepUseCase(user_stats_repo)
    return await use_case.execute(c_user.id)


@router.get('/statistics/platforms', response_model=List[PlarformApplications])
async def plarform_applications(
    c_user: CurrentUserDp, user_stats_repo: UserStatsRepositoryDp
):
    use_case = GetPlatformStatsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id)


@router.get('/statistics/mode', response_model=ModeApplications)
async def mode_applications(
    c_user: CurrentUserDp, user_stats_repo: UserStatsRepositoryDp
):
    use_case = GetModeStatsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id)


@router.get('/statistics/trends', response_model=List[ApplicationsTrend])
async def applications_trend(
    c_user: CurrentUserDp, user_stats_repo: UserStatsRepositoryDp
):
    use_case = GetLastMonthTrendsStatsUseCase(user_stats_repo)
    return await use_case.execute(c_user.id)
