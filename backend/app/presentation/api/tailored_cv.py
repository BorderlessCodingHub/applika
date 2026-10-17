"""Application CV copy routes - one copy per application, under its owner.

A thin router. Every endpoint resolves the acting user and the use cases scope
to that user's own rows (docs/adr/0004-row-ownership-and-is-admin.md),
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

from fastapi import APIRouter, Response

from app.application.dto.tailored_cv import (
    TailoredCVCreateDTO,
    TailoredCVUpdateDTO,
)
from app.core.exceptions import BusinessRuleViolation
from app.core.features import FeatureKey
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CreateTailoredCVUseCaseDp,
    CurrentUserDp,
    DeleteTailoredCVUseCaseDp,
    FeatureRepositoryDp,
    GetTailoredCVFitUseCaseDp,
    GetTailoredCVUseCaseDp,
    RenderTailoredCVDiffMarkdownUseCaseDp,
    RenderTailoredCVDiffPdfUseCaseDp,
    RenderTailoredCVMarkdownUseCaseDp,
    RenderTailoredCVPdfUseCaseDp,
    UpdateTailoredCVUseCaseDp,
    require_feature,
    user_has_feature,
)
from app.presentation.gated_slash import add_slash_twins
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.tailored_cv import (
    CVFit,
    TailoredCVCreate,
    TailoredCVOut,
    TailoredCVUpdate,
)

# ADR-0018: "keywords" without the "jobs" feature is refused as if the option
# did not exist; "copy" and an absent field (every installed applika-cli)
# never look at the feature.
UNKNOWN_TAILORING = 'Unknown tailoring option'

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
    feature_repo: FeatureRepositoryDp,
):
    """Copy one of the acting user's master CVs onto this application.

    ``tailoring`` is ``'copy'`` (the verbatim copy, the default) or
    ``'keywords'`` (the same copy reordered by job match, ADR-0017).

    404 when the application or the chosen master CV is unknown or not owned,
    409 when the application already has a copy or has been finalized, 422
    when it is archived in a cycle or when ``'keywords'`` is asked for on an
    application without a job description. ``'keywords'`` without the
    "jobs" feature is a 422 "Unknown tailoring option", nothing written.
    """
    if payload.tailoring == 'keywords' and not await user_has_feature(
        FeatureKey.JOBS, c_user, feature_repo
    ):
        raise BusinessRuleViolation(UNKNOWN_TAILORING)
    data = TailoredCVCreateDTO(
        user_id=c_user.id,
        application_id=application_id,
        base_cv_id=payload.base_cv_id,
        tailoring=payload.tailoring,
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


@router.get(
    '/{application_id}/cv/fit',
    response_model=CVFit,
    responses={'404': {'model': DetailSchema}},
    # ADR-0018: without "jobs" this route is an unknown route (404).
    dependencies=[require_feature(FeatureKey.JOBS)],
)
async def get_tailored_cv_fit(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: GetTailoredCVFitUseCaseDp,
):
    """The keyword fit of this application's CV copy for its job description.

    A whole number from 0 to 100 with the matched and missing keywords;
    ``null`` and two empty lists when the application has no job
    description. Drafts included; never refused on a finalized or archived
    application (a read). 404 when the application is not owned or has no
    copy.
    """
    fit = await use_case.execute(application_id, c_user.id)
    return CVFit.model_validate(fit.model_dump())


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


@router.post(
    '/{application_id}/cv/pdf',
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
async def export_tailored_cv_pdf(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: RenderTailoredCVPdfUseCaseDp,
):
    """Download this application's CV copy as a PDF.

    Like ``GET``, and unlike every write here, this carries **no**
    finalized or archived guard: the copy of an application that is over
    is exactly the one the user is most likely to want a PDF of. 404 when
    the application is unknown, not owned, or has no copy; 500 when the
    render fails, with nothing written.
    """
    rendered = await use_case.execute(application_id, c_user.id)
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
    '/{application_id}/cv/markdown',
    response_class=Response,
    responses={
        '200': {
            'content': {'text/markdown': {}},
            'description': 'The CV copy as Markdown.',
        },
        '404': {'model': DetailSchema},
        '500': {'model': DetailSchema},
    },
)
async def export_tailored_cv_markdown(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: RenderTailoredCVMarkdownUseCaseDp,
):
    """Download this application's CV copy as Markdown.

    Like ``GET`` and the PDF download, and unlike every write here, this
    carries **no** finalized or archived guard. 404 when the application
    is unknown, not owned, or has no copy; 500 when the render fails,
    with nothing written.
    """
    rendered = await use_case.execute(application_id, c_user.id)
    return Response(
        content=rendered.content,
        media_type='text/markdown; charset=utf-8',
        headers={
            'Content-Disposition': (
                f'attachment; filename="{rendered.filename}"'
            )
        },
    )


@router.get(
    '/{application_id}/cv/diff/markdown',
    response_class=Response,
    responses={
        '200': {
            'content': {'text/markdown': {}},
            'description': 'The diff between the copy and its baseline.',
        },
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '500': {'model': DetailSchema},
    },
)
async def export_tailored_cv_diff_markdown(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: RenderTailoredCVDiffMarkdownUseCaseDp,
):
    """Download the diff between this CV copy and its baseline as Markdown.

    The baseline is ``base_snapshot`` when present, else the current
    master CV via ``base_cv_id``; when neither resolves the answer is
    409 "This CV copy has no baseline to compare with." No finalized or
    archived guard, same as ``GET`` and the other exports. 404 when the
    application is unknown, not owned, or has no copy.
    """
    rendered = await use_case.execute(application_id, c_user.id)
    return Response(
        content=rendered.content,
        media_type='text/markdown; charset=utf-8',
        headers={
            'Content-Disposition': (
                f'attachment; filename="{rendered.filename}"'
            )
        },
    )


@router.get(
    '/{application_id}/cv/diff/pdf',
    response_class=Response,
    responses={
        '200': {
            'content': {'application/pdf': {}},
            'description': 'The diff between the copy and its baseline.',
        },
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '500': {'model': DetailSchema},
    },
)
async def export_tailored_cv_diff_pdf(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    use_case: RenderTailoredCVDiffPdfUseCaseDp,
):
    """Download the diff between this CV copy and its baseline as a PDF.

    Same content and the same baseline/409 rule as
    ``.../cv/diff/markdown``, compiled through Typst
    (docs/adr/0011-server-side-cv-pdf-rendercv.md).
    """
    rendered = await use_case.execute(application_id, c_user.id)
    return Response(
        content=rendered.content,
        media_type='application/pdf',
        headers={
            'Content-Disposition': (
                f'attachment; filename="{rendered.filename}"'
            )
        },
    )


# ADR-0018: only the gated route gets a slash twin; every other CV route
# keeps Starlette's trailing-slash redirect.
add_slash_twins(router, include=lambda route: route.path.endswith('/cv/fit'))
