from fastapi import APIRouter

from app.application.dto.step_definition import (
    StepDefinitionCreateDTO,
    StepDefinitionUpdateDTO,
)
from app.application.use_cases.admin.step_definitions.create_step_definition import (
    CreateStepDefinitionUseCase,
)
from app.application.use_cases.admin.step_definitions.delete_step_definition import (
    DeleteStepDefinitionUseCase,
)
from app.application.use_cases.admin.step_definitions.list_step_definitions import (
    ListStepDefinitionsUseCase,
)
from app.application.use_cases.admin.step_definitions.update_step_definition import (
    UpdateStepDefinitionUseCase,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
    StepDefinitionRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    CreateStepDefinitionSchema,
    StepDefinitionSchema,
    UpdateStepDefinitionSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Step Definitions'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/step-definitions',
    response_model=list[StepDefinitionSchema],
)
async def list_admin_step_definitions(
    admin: AdminUserDp,
    step_repo: StepDefinitionRepositoryDp,
):
    use_case = ListStepDefinitionsUseCase(step_repo)
    dtos = await use_case.execute(admin.id)
    return [
        StepDefinitionSchema.model_validate(d) for d in dtos
    ]


@router.post(
    '/step-definitions',
    response_model=StepDefinitionSchema,
    status_code=201,
)
async def create_admin_step_definition(
    body: CreateStepDefinitionSchema,
    admin: AdminUserDp,
    step_repo: StepDefinitionRepositoryDp,
):
    use_case = CreateStepDefinitionUseCase(step_repo)
    data = StepDefinitionCreateDTO(
        name=body.name,
        color=body.color,
        strict=body.strict,
    )
    dto = await use_case.execute(data, admin.id)
    return StepDefinitionSchema.model_validate(dto)


@router.patch(
    '/step-definitions/{step_id}',
    response_model=StepDefinitionSchema,
)
async def update_admin_step_definition(
    step_id: int,
    body: UpdateStepDefinitionSchema,
    admin: AdminUserDp,
    step_repo: StepDefinitionRepositoryDp,
):
    use_case = UpdateStepDefinitionUseCase(step_repo)
    data = StepDefinitionUpdateDTO(
        **body.model_dump(exclude_unset=True)
    )
    dto = await use_case.execute(step_id, data, admin.id)
    return StepDefinitionSchema.model_validate(dto)


@router.delete(
    '/step-definitions/{step_id}', status_code=204
)
async def delete_admin_step_definition(
    step_id: int,
    admin: AdminUserDp,
    step_repo: StepDefinitionRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = DeleteStepDefinitionUseCase(
        step_repo, admin_repo
    )
    await use_case.execute(step_id, admin.id)
