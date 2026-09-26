from fastapi import APIRouter

from app.application.dto.user_feedback import SubmitFeedbackPayloadDTO
from app.application.use_cases.user_feedbacks.submit_feedback import (
    SubmitFeedbackUseCase,
)
from app.presentation.dependencies import (
    CurrentUserDp,
    DiscordConnectionRepositoryDp,
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
    conn_repo: DiscordConnectionRepositoryDp,
):
    use_case = SubmitFeedbackUseCase(feedback_repo, discord_service)
    data = SubmitFeedbackPayloadDTO(**payload.model_dump())
    # The connection is read fresh from this request's own repository call
    # (KODI-024), in any status (R-041): mentioning a linked user does not
    # depend on the connection being ``active``.
    connection = await conn_repo.get_by_user_id(c_user.id)
    discord_id = connection.discord_id if connection else None
    result = await use_case.execute(
        c_user.id, c_user.username, data, discord_id=discord_id
    )
    return SubmitFeedbackResponse.model_validate(result.model_dump())
