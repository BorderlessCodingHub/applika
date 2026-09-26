from datetime import date

from fastapi import APIRouter, Query, Response

from app.application.dto.user import UserUpdateDTO
from app.application.use_cases.get_user_agenda import (
    GetUserAgendaUseCase,
)
from app.application.use_cases.update_user import UpdateUserUseCase
from app.config.settings import envs
from app.presentation.dependencies import (
    CurrentUserDp,
    DiscordConnectionRepositoryDp,
    StepDefinitionRepositoryDp,
    TimelineEventRepositoryDp,
    UnlinkDiscordUseCaseDp,
    UserRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application_step import AgendaStepSchema
from app.presentation.schemas.user import UpdateUserProfile, UserProfile

router = APIRouter(tags=['Users'], responses={'403': {'model': DetailSchema}})


@router.get('/users/me', response_model=UserProfile)
async def get_me(
    c_user: CurrentUserDp,
    conn_repo: DiscordConnectionRepositoryDp,
):
    connection = await conn_repo.get_by_user_id(c_user.id)
    return UserProfile.from_user(c_user, connection)


@router.patch('/users/me', response_model=UserProfile)
async def update_me(
    payload: UpdateUserProfile,
    c_user: CurrentUserDp,
    user_repo: UserRepositoryDp,
    conn_repo: DiscordConnectionRepositoryDp,
):
    use_case = UpdateUserUseCase(user_repo)
    data = UserUpdateDTO(**payload.model_dump(exclude_unset=True))
    user = await use_case.execute(c_user.id, data)
    connection = await conn_repo.get_by_user_id(c_user.id)
    return UserProfile.from_user(user, connection)


@router.get('/users/me/agenda', response_model=list[AgendaStepSchema])
async def get_my_agenda(
    c_user: CurrentUserDp,
    timeline_repo: TimelineEventRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
    # Two separate Query() instances: FastAPI writes the first parameter's
    # name onto a shared Query default object, so a second parameter that
    # reuses the same instance ends up reading the first one's query key —
    # sharing one instance here silently dropped ``to_date``.
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    use_case = GetUserAgendaUseCase(timeline_repo, step_repo)
    dtos = await use_case.execute(
        user_id=c_user.id,
        from_date=from_date,
        to_date=to_date,
    )
    return [AgendaStepSchema.model_validate(d) for d in dtos]


@router.delete('/users/me', status_code=204)
async def delete_me(
    c_user: CurrentUserDp,
    user_repo: UserRepositoryDp,
    unlink_discord_use_case: UnlinkDiscordUseCaseDp,
    response: Response,
):
    # Revoke the Discord grant best-effort before the row goes by cascade
    # (T102): the connection would disappear either way once the user is
    # deleted, but only this call actually asks Discord to revoke it.
    await unlink_discord_use_case.execute(c_user.id)

    user = await user_repo.get_by_id(c_user.id)
    if user:
        await user_repo.delete(user)

    is_prod = envs.ENVIRONMENT == 'PROD'
    response.delete_cookie('__access', path='/', secure=is_prod, httponly=True)
    response.delete_cookie('__refresh', path='/', secure=is_prod, httponly=True)
