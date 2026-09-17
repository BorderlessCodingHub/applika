"""Application CV copy routes - one copy per application, under its owner.

A thin router. Every endpoint resolves the acting user and the use cases scope
to that user's own rows (docs/applika/adr/0004-row-ownership-and-is-admin.md),
so another user's application is a 404 on all four verbs - for an admin too.
No business logic lives here: the one-copy-per-application rule, the master
CV's ownership check and the read-only refusal all belong to the use cases.

Writing is refused on an application archived in a cycle (422) or finalized
(409), matching how a step is refused. **Reading is not**: ``GET`` has no such
guard, because the user must still be able to look at the CV copy of a
finished application.

``application_id`` arrives as a Snowflake string on the wire and is validated
into an ``int`` by ``SnowflakeID``.
"""

from fastapi import APIRouter

from app.application.dto.tailored_cv import (
    TailoredCVCreateDTO,
    TailoredCVUpdateDTO,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CreateTailoredCVUseCaseDp,
    CurrentUserDp,
    DeleteTailoredCVUseCaseDp,
    GetTailoredCVUseCaseDp,
    UpdateTailoredCVUseCaseDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.tailored_cv import (
    TailoredCVCreate,
    TailoredCVOut,
    TailoredCVUpdate,
)

router = APIRouter(
    prefix='/applications',
    tags=['Application CVs'],
    responses={'403': {'model': DetailSchema}},
)


@router.post(
    '/{application_id}/cv',
    response_model=TailoredCVOut,
    status_code=201,
    responses={
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '422': {'model': DetailSchema},
    },
)
async def create_tailored_cv(
    application_id: SnowflakeID,
    payload: TailoredCVCreate,
    c_user: CurrentUserDp,
    use_case: CreateTailoredCVUseCaseDp,
):
    """Copy one of the acting user's master CVs onto this application.

    404 when the application or the chosen master CV is unknown or not owned,
    409 when the application already has a copy or has been finalized, 422
    when it is archived in a cycle.
    """
    data = TailoredCVCreateDTO(
        user_id=c_user.id,
        application_id=application_id,
        base_cv_id=payload.base_cv_id,
    )
    tailored_cv = await use_case.execute(data)
    return TailoredCVOut.model_validate(tailored_cv)


@router.get(
    '/{application_id}/cv',
    response_model=TailoredCVOut,
    responses={'404': {'model': DetailSchema}},
)
async def get_tailored_cv(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: GetTailoredCVUseCaseDp,
):
    """Fetch this application's CV copy.

    Always allowed while the application is owned, finalized or archived
    included: only writing is refused.
    """
    tailored_cv = await use_case.execute(application_id, c_user.id)
    return TailoredCVOut.model_validate(tailored_cv)


@router.put(
    '/{application_id}/cv',
    response_model=TailoredCVOut,
    responses={
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '422': {'model': DetailSchema},
    },
)
async def update_tailored_cv(
    application_id: SnowflakeID,
    payload: TailoredCVUpdate,
    c_user: CurrentUserDp,
    use_case: UpdateTailoredCVUseCaseDp,
):
    """Replace this application's CV copy whole - every field is editable.

    The master CV it came from is never touched. 409 when the application is
    finalized, 422 when it is archived in a cycle.
    """
    data = TailoredCVUpdateDTO(**payload.model_dump())
    tailored_cv = await use_case.execute(application_id, c_user.id, data)
    return TailoredCVOut.model_validate(tailored_cv)


@router.delete(
    '/{application_id}/cv',
    status_code=204,
    responses={
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '422': {'model': DetailSchema},
    },
)
async def delete_tailored_cv(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: DeleteTailoredCVUseCaseDp,
):
    """Delete this application's CV copy; a new one can then be made.

    409 when the application is finalized, 422 when it is archived in a cycle.
    """
    await use_case.execute(application_id, c_user.id)
