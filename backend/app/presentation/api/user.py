from datetime import date
from typing import List

from fastapi import APIRouter, Query, Response

from app.application.dto.user import UserUpdateDTO
from app.application.use_cases.update_user import UpdateUserUseCase
from app.config.settings import envs
from app.presentation.dependencies import (
    ApplicationStepRepositoryDp,
    CurrentUserDp,
    UserRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application_step import AgendaStepSchema
from app.presentation.schemas.user import UpdateUserProfile, UserProfile

router = APIRouter(tags=['Users'], responses={'403': {'model': DetailSchema}})


@router.get('/users/me', response_model=UserProfile)
def get_me(c_user: CurrentUserDp):
    return UserProfile.model_validate(c_user)


@router.patch('/users/me', response_model=UserProfile)
async def update_me(
    payload: UpdateUserProfile,
    c_user: CurrentUserDp,
    user_repo: UserRepositoryDp,
):
    use_case = UpdateUserUseCase(user_repo)
    data = UserUpdateDTO(**payload.model_dump(exclude_unset=True))
    user = await use_case.execute(c_user.id, data)
    return UserProfile.model_validate(user)


@router.get(
    '/users/me/agenda', response_model=List[AgendaStepSchema]
)
async def get_my_agenda(
    c_user: CurrentUserDp,
    app_step_repo: ApplicationStepRepositoryDp,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    steps = await app_step_repo.get_user_agenda(
        user_id=c_user.id,
        from_date=from_date,
        to_date=to_date,
    )
    return [
        AgendaStepSchema(
            id=s.id,
            step_id=s.step_id,
            step_date=s.step_date,
            step_name=s.step_def.name if s.step_def else None,
            step_color=s.step_def.color if s.step_def else None,
            start_time=s.start_time,
            end_time=s.end_time,
            timezone=s.timezone,
            observation=s.observation,
            application_id=s.application_id,
            company_name=s.application.company_name,
            role=s.application.role,
        )
        for s in steps
    ]


@router.delete('/users/me', status_code=204)
async def delete_me(
    c_user: CurrentUserDp,
    user_repo: UserRepositoryDp,
    response: Response,
):
    user = await user_repo.get_by_id(c_user.id)
    if user:
        await user_repo.delete(user)

    is_prod = envs.ENVIRONMENT == 'PROD'
    response.delete_cookie(
        '__access', path='/', secure=is_prod, httponly=True
    )
    response.delete_cookie(
        '__refresh', path='/', secure=is_prod, httponly=True
    )
