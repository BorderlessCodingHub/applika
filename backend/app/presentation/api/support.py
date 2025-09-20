from fastapi import APIRouter

from app.application.use_cases.get_supports import GetSupportsUseCase
from app.presentation.dependencies import (
    CurrentUserDp,
    FeedbackDefinitionRepositoryDp,
    PlatformRepositoryDp,
    StepDefinitionRepositoryDp,
)
from app.presentation.schemas.support import SupportSchema

router = APIRouter(tags=['Supports'])


@router.get('/supports', response_model=SupportSchema)
async def get_supports_data(
    c_user: CurrentUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
    platform_repo: PlatformRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
):
    use_case = GetSupportsUseCase(
        feedback_repo=feedback_repo,
        platform_repo=platform_repo,
        step_repo=step_repo,
    )
    return await use_case.execute()
