from fastapi import APIRouter
from typing import List

from app.presentation.dependencies import CurrentUserDp
from app.presentation.schemas.statistic import (
    ApplicationsStatistics, ApplicationsTrend, AvarageDaysSteps,
    ModeApplications, PlarformApplications, StepConversionRate)

router = APIRouter(prefix="/applications", tags=["Applications Statistics"])


@router.get("/statistics", response_model=ApplicationsStatistics)
def statistics(c_user: CurrentUserDp):
    raise NotImplementedError()


@router.get("/statistics/steps/conversion_rate",
            response_model=List[StepConversionRate])
def step_conversion_rate(c_user: CurrentUserDp):
    raise NotImplementedError()


@router.get("/statistics/steps/avarage_days",
            response_model=List[AvarageDaysSteps])
def step_avarage_day(c_user: CurrentUserDp):
    raise NotImplementedError()


@router.get("/statistics/platforms", response_model=List[PlarformApplications])
def plarform_applications(c_user: CurrentUserDp):
    raise NotImplementedError()


@router.get("/statistics/mode", response_model=List[ModeApplications])
def mode_applications(c_user: CurrentUserDp):
    raise NotImplementedError()


@router.get("/statistics/trends", response_model=List[ApplicationsTrend])
def applications_trend(c_user: CurrentUserDp):
    raise NotImplementedError()
