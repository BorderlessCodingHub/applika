"""Master CV routes - the user's reusable CVs, capped at 3 per user.

A thin router: every endpoint resolves the acting user and scopes to that
user's own rows (docs/adr/0004-row-ownership-and-is-admin.md), so a
master CV belonging to another user is a 404 - for an admin too, because
``users.is_admin`` grants no extra access through the user routes. No business
logic lives here: the 3-per-user cap belongs to ``CreateBaseCVUseCase``.

``base_cv_id`` arrives as a Snowflake string on the wire and is validated into
an ``int`` by ``SnowflakeID``.
"""

from fastapi import APIRouter, Response

from app.application.dto.base_cv import BaseCVCreateDTO, BaseCVUpdateDTO
from app.application.services.job_queue import request_fit_recompute
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CreateBaseCVUseCaseDp,
    CurrentUserDp,
    DeleteBaseCVUseCaseDp,
    GetBaseCVUseCaseDp,
    JobQueueDp,
    ListBaseCVsUseCaseDp,
    RenderBaseCVMarkdownUseCaseDp,
    RenderBaseCVPdfUseCaseDp,
    UpdateBaseCVUseCaseDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.base_cv import (
    BaseCVCreate,
    BaseCVOut,
    BaseCVUpdate,
)

router = APIRouter(
    tags=['Base CVs'], responses={'403': {'model': DetailSchema}}
)


@router.get('/base-cvs', response_model=list[BaseCVOut])
async def list_base_cvs(
    c_user: CurrentUserDp,
    use_case: ListBaseCVsUseCaseDp,
):
    """List the acting user's own master CVs, newest first."""
    base_cvs = await use_case.execute(c_user.id)
    return [BaseCVOut.model_validate(base_cv) for base_cv in base_cvs]


@router.post(
    '/base-cvs',
    response_model=BaseCVOut,
    status_code=201,
    responses={'409': {'model': DetailSchema}},
)
async def create_base_cv(
    payload: BaseCVCreate,
    c_user: CurrentUserDp,
    use_case: CreateBaseCVUseCaseDp,
    job_queue: JobQueueDp,
):
    """Create a master CV owned by the acting user.

    ``user_id`` is stamped from the acting user; a fourth master CV is refused
    with 409 and the message the user is shown. Then, best effort, its fit on
    the listed jobs is queued for a recompute (KODI-046, R-016).
    """
    data = BaseCVCreateDTO(user_id=c_user.id, **payload.model_dump())
    base_cv = await use_case.execute(data)
    await request_fit_recompute(job_queue, base_cv.id)
    return BaseCVOut.model_validate(base_cv)


@router.get(
    '/base-cvs/{base_cv_id}',
    response_model=BaseCVOut,
    responses={'404': {'model': DetailSchema}},
)
async def get_base_cv(
    base_cv_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: GetBaseCVUseCaseDp,
):
    """Fetch one of the acting user's own master CVs (404 if not owned)."""
    base_cv = await use_case.execute(base_cv_id, c_user.id)
    return BaseCVOut.model_validate(base_cv)


@router.patch(
    '/base-cvs/{base_cv_id}',
    response_model=BaseCVOut,
    responses={'404': {'model': DetailSchema}},
)
async def update_base_cv(
    base_cv_id: SnowflakeID,
    payload: BaseCVUpdate,
    c_user: CurrentUserDp,
    use_case: UpdateBaseCVUseCaseDp,
    job_queue: JobQueueDp,
):
    """Partially update one of the acting user's own master CVs.

    Only the fields explicitly provided are applied; a section provided
    replaces that section whole. 404 if not owned. Then, best effort, its fit
    is queued for a recompute (KODI-046, R-016).
    """
    data = BaseCVUpdateDTO(**payload.model_dump(exclude_unset=True))
    base_cv = await use_case.execute(base_cv_id, c_user.id, data)
    await request_fit_recompute(job_queue, base_cv.id)
    return BaseCVOut.model_validate(base_cv)


@router.delete(
    '/base-cvs/{base_cv_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_base_cv(
    base_cv_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: DeleteBaseCVUseCaseDp,
):
    """Delete one of the acting user's own master CVs.

    Never blocked: 204 on success, 404 when it does not exist or is not owned.
    Its fit rows go with it (FK ``ON DELETE CASCADE``, R-016); nothing is
    queued.
    """
    await use_case.execute(base_cv_id, c_user.id)


@router.post(
    '/base-cvs/{base_cv_id}/pdf',
    response_class=Response,
    responses={
        '200': {
            'content': {'application/pdf': {}},
            'description': 'The typeset CV.',
        },
        '404': {'model': DetailSchema},
        '500': {'model': DetailSchema},
    },
)
async def export_base_cv_pdf(
    base_cv_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: RenderBaseCVPdfUseCaseDp,
):
    """Download one of the acting user's own master CVs as a PDF.

    ``POST`` rather than ``GET`` because the server does real work here -
    a Typst compile - and the result must never be cached as a resource.
    There is no body and no theme parameter: the look is fixed
    (docs/adr/0011-server-side-cv-pdf-rendercv.md). 404 if the CV
    does not exist or is not owned, 500 if the render fails - and nothing
    is written either way.
    """
    rendered = await use_case.execute(base_cv_id, c_user.id)
    return Response(
        content=rendered.content,
        media_type='application/pdf',
        headers={
            'Content-Disposition': (
                f'attachment; filename="{rendered.filename}"'
            )
        },
    )


@router.get(
    '/base-cvs/{base_cv_id}/markdown',
    response_class=Response,
    responses={
        '200': {
            'content': {'text/markdown': {}},
            'description': 'The CV as Markdown.',
        },
        '404': {'model': DetailSchema},
        '500': {'model': DetailSchema},
    },
)
async def export_base_cv_markdown(
    base_cv_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: RenderBaseCVMarkdownUseCaseDp,
):
    """Download one of the acting user's own master CVs as Markdown.

    ``GET``, unlike the PDF export: rendering here is Jinja over the same
    mapped document the PDF path builds, cheap enough to treat as an
    ordinary read (docs/adr/0011-server-side-cv-pdf-rendercv.md
    still governs the theme and the fixed look; there is no theme
    parameter here either). 404 if the CV does not exist or is not
    owned, 500 if the render fails - nothing is written either way.
    """
    rendered = await use_case.execute(base_cv_id, c_user.id)
    return Response(
        content=rendered.content,
        media_type='text/markdown; charset=utf-8',
        headers={
            'Content-Disposition': (
                f'attachment; filename="{rendered.filename}"'
            )
        },
    )
