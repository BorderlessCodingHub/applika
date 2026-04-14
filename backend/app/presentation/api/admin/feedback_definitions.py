from fastapi import APIRouter

from app.application.dto.feedback_definition import (
    FeedbackDefinitionCreateDTO,
    FeedbackDefinitionUpdateDTO,
)
from app.application.use_cases.admin.feedback_definitions.create_feedback_definition import (
    CreateFeedbackDefinitionUseCase,
)
from app.application.use_cases.admin.feedback_definitions.delete_feedback_definition import (
    DeleteFeedbackDefinitionUseCase,
)
from app.application.use_cases.admin.feedback_definitions.list_feedback_definitions import (
    ListFeedbackDefinitionsUseCase,
)
from app.application.use_cases.admin.feedback_definitions.update_feedback_definition import (
    UpdateFeedbackDefinitionUseCase,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
    FeedbackDefinitionRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    CreateFeedbackDefinitionSchema,
    FeedbackDefinitionSchema,
    UpdateFeedbackDefinitionSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Feedback Definitions'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/feedback-definitions',
    response_model=list[FeedbackDefinitionSchema],
)
async def list_admin_feedback_definitions(
    admin: AdminUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
):
    use_case = ListFeedbackDefinitionsUseCase(feedback_repo)
    dtos = await use_case.execute(admin.id)
    return [
        FeedbackDefinitionSchema.model_validate(d)
        for d in dtos
    ]


@router.post(
    '/feedback-definitions',
    response_model=FeedbackDefinitionSchema,
    status_code=201,
)
async def create_admin_feedback_definition(
    body: CreateFeedbackDefinitionSchema,
    admin: AdminUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
):
    use_case = CreateFeedbackDefinitionUseCase(feedback_repo)
    data = FeedbackDefinitionCreateDTO(
        name=body.name, color=body.color
    )
    dto = await use_case.execute(data, admin.id)
    return FeedbackDefinitionSchema.model_validate(dto)


@router.patch(
    '/feedback-definitions/{feedback_id}',
    response_model=FeedbackDefinitionSchema,
)
async def update_admin_feedback_definition(
    feedback_id: int,
    body: UpdateFeedbackDefinitionSchema,
    admin: AdminUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
):
    use_case = UpdateFeedbackDefinitionUseCase(feedback_repo)
    data = FeedbackDefinitionUpdateDTO(
        **body.model_dump(exclude_unset=True)
    )
    dto = await use_case.execute(
        feedback_id, data, admin.id
    )
    return FeedbackDefinitionSchema.model_validate(dto)


@router.delete(
    '/feedback-definitions/{feedback_id}', status_code=204
)
async def delete_admin_feedback_definition(
    feedback_id: int,
    admin: AdminUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = DeleteFeedbackDefinitionUseCase(
        feedback_repo, admin_repo
    )
    await use_case.execute(feedback_id, admin.id)
