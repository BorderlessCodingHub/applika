from fastapi import APIRouter

from app.application.dto.user_feedback import SubmitFeedbackPayloadDTO
from app.application.use_cases.user_feedbacks.submit_feedback import (
    SubmitFeedbackUseCase,
)
from app.presentation.dependencies import (
    CurrentUserDp,
    DiscordFeedbackServiceDp,
    UserFeedbackRepositoryDp,
)
from app.presentation.schemas.user_feedback import (
    SubmitFeedbackRequest,
    SubmitFeedbackResponse,
)

router = APIRouter(tags=['Feedbacks'])


@router.post(
    '/feedbacks',
    response_model=SubmitFeedbackResponse,
    status_code=201,
)
async def submit_feedback(
    payload: SubmitFeedbackRequest,
    c_user: CurrentUserDp,
    feedback_repo: UserFeedbackRepositoryDp,
    discord_service: DiscordFeedbackServiceDp,
):
    use_case = SubmitFeedbackUseCase(
        feedback_repo, discord_service
    )
    data = SubmitFeedbackPayloadDTO(**payload.model_dump())
    result = await use_case.execute(
        c_user.id, c_user.username, data
    )
    return SubmitFeedbackResponse.model_validate(
        result.model_dump()
    )
