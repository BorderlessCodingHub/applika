from fastapi import APIRouter, UploadFile

from app.application.use_cases.resumes.delete_resume import DeleteResumeUseCase
from app.application.use_cases.resumes.list_resumes import ListResumesUseCase
from app.application.use_cases.resumes.set_default_resume import (
    SetDefaultResumeUseCase,
)
from app.application.use_cases.resumes.upload_resume import UploadResumeUseCase
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CurrentUserDp,
    UserResumeRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.resumes import (
    SetDefaultResumeSchema,
    UserResumeSchema,
)

router = APIRouter(
    prefix='/users/me/resumes',
    tags=['Resumes'],
    responses={'403': {'model': DetailSchema}},
)


@router.get('', response_model=list[UserResumeSchema])
async def list_resumes(
    current_user: CurrentUserDp,
    resume_repo: UserResumeRepositoryDp,
):
    use_case = ListResumesUseCase(resume_repo)
    dtos = await use_case.execute(current_user.id)
    return [UserResumeSchema.model_validate(d.model_dump()) for d in dtos]


@router.post(
    '',
    response_model=UserResumeSchema,
    status_code=201,
)
async def upload_resume(
    current_user: CurrentUserDp,
    resume_repo: UserResumeRepositoryDp,
    file: UploadFile,
):
    data = await file.read()
    use_case = UploadResumeUseCase(resume_repo)
    dto = await use_case.execute(
        user_id=current_user.id,
        filename=file.filename or 'resume',
        content_type=file.content_type or 'text/plain',
        data=data,
    )
    return UserResumeSchema.model_validate(dto.model_dump())


@router.patch(
    '/{resume_id}',
    response_model=UserResumeSchema,
    responses={'404': {'model': DetailSchema}},
)
async def update_resume(
    resume_id: SnowflakeID,
    data: SetDefaultResumeSchema,
    current_user: CurrentUserDp,
    resume_repo: UserResumeRepositoryDp,
):
    use_case = SetDefaultResumeUseCase(resume_repo)
    dto = await use_case.execute(int(resume_id), current_user.id)
    return UserResumeSchema.model_validate(dto.model_dump())


@router.delete(
    '/{resume_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_resume(
    resume_id: SnowflakeID,
    current_user: CurrentUserDp,
    resume_repo: UserResumeRepositoryDp,
):
    use_case = DeleteResumeUseCase(resume_repo)
    await use_case.execute(int(resume_id), current_user.id)
