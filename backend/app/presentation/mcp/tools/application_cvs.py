"""Application CV tools (applika-cli ``applications cv get|create|edit|
delete|download|diff``), over the use cases ``presentation/api/
tailored_cv.py`` runs. Only for a user with the ``cvs`` feature.

Another user's application is a 404, admins included (ADR-0004). Writing is
refused on an archived (422) or closed (409) application; reading never is.
``edit_application_cv`` merges what is sent onto the stored copy, as the
CLI did, then sends the full replace the REST ``PUT`` expects.
"""

from typing import Any, Literal

from app.application.dto.tailored_cv import (
    TailoredCVCreateDTO,
    TailoredCVUpdateDTO,
)
from app.application.services.cv_rendering.diff_pdf_renderer import (
    get_cv_diff_pdf_renderer,
)
from app.application.services.cv_rendering.markdown_renderer import (
    get_cv_markdown_renderer,
)
from app.application.services.cv_rendering.renderer import get_cv_pdf_renderer
from app.application.use_cases.tailored_cvs.create import (
    CreateTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.delete import (
    DeleteTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.diff import (
    ComputeTailoredCVDiffUseCase,
)
from app.application.use_cases.tailored_cvs.get import GetTailoredCVUseCase
from app.application.use_cases.tailored_cvs.render_diff_markdown import (
    RenderTailoredCVDiffMarkdownUseCase,
)
from app.application.use_cases.tailored_cvs.render_diff_pdf import (
    RenderTailoredCVDiffPdfUseCase,
)
from app.application.use_cases.tailored_cvs.render_markdown import (
    RenderTailoredCVMarkdownUseCase,
)
from app.application.use_cases.tailored_cvs.render_pdf import (
    RenderTailoredCVPdfUseCase,
)
from app.application.use_cases.tailored_cvs.update import (
    UpdateTailoredCVUseCase,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import BusinessRuleViolation
from app.core.features import FeatureKey
from app.core.mcp_scopes import McpScope
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.feature_repository import FeatureRepository
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)
from app.lib.types import SnowflakeID
from app.presentation.api.tailored_cv import UNKNOWN_TAILORING
from app.presentation.dependencies import resolve_tailoring, user_has_feature
from app.presentation.mcp.registry import (
    DELETED_OUTPUT,
    McpTool,
    ToolContext,
    deleted,
    markdown_result,
    object_output,
    pdf_result,
)
from app.presentation.mcp.tools.common import (
    ApplicationRef,
    assign_item_ids,
    item_ids_optional,
)
from app.presentation.schemas.base_cv import BaseCVUpdate
from app.presentation.schemas.tailored_cv import (
    TailoredCVCreate,
    TailoredCVOut,
    TailoredCVUpdate,
)

ExportFormat = Literal['markdown', 'pdf']


class ApplicationCvExportIn(ApplicationRef):
    format: ExportFormat = 'markdown'


class CreateApplicationCvIn(TailoredCVCreate):
    application_id: SnowflakeID


class EditApplicationCvIn(BaseCVUpdate):
    """The copy's fields, each optional (the master CV's ``PATCH`` shape);
    merged onto the stored copy and validated as the REST ``PUT`` body."""

    application_id: SnowflakeID


def _repos(
    ctx: ToolContext,
) -> tuple[TailoredCVRepository, ApplicationRepository]:
    return TailoredCVRepository(ctx.session), ApplicationRepository(ctx.session)


def _diff(ctx: ToolContext) -> ComputeTailoredCVDiffUseCase:
    tailored, applications = _repos(ctx)
    return ComputeTailoredCVDiffUseCase(
        tailored, applications, BaseCVRepository(ctx.session)
    )


async def get_application_cv(
    ctx: ToolContext, args: ApplicationRef
) -> TailoredCVOut:
    copy = await GetTailoredCVUseCase(*_repos(ctx)).execute(
        args.application_id, ctx.user_id
    )
    return TailoredCVOut.model_validate(copy)


async def download_application_cv(
    ctx: ToolContext, args: ApplicationCvExportIn
) -> Any:
    tailored, applications = _repos(ctx)
    if args.format == 'pdf':
        pdf = await RenderTailoredCVPdfUseCase(
            tailored, applications, get_cv_pdf_renderer()
        ).execute(args.application_id, ctx.user_id)
        return pdf_result(pdf.content, pdf.filename)
    markdown = await RenderTailoredCVMarkdownUseCase(
        tailored, applications, get_cv_markdown_renderer()
    ).execute(args.application_id, ctx.user_id)
    return markdown_result(markdown.content)


async def diff_application_cv(
    ctx: ToolContext, args: ApplicationCvExportIn
) -> Any:
    if args.format == 'pdf':
        pdf = await RenderTailoredCVDiffPdfUseCase(
            _diff(ctx), get_cv_diff_pdf_renderer()
        ).execute(args.application_id, ctx.user_id)
        return pdf_result(pdf.content, pdf.filename)
    markdown = await RenderTailoredCVDiffMarkdownUseCase(_diff(ctx)).execute(
        args.application_id, ctx.user_id
    )
    return markdown_result(markdown.content)


async def create_application_cv(
    ctx: ToolContext, args: CreateApplicationCvIn
) -> TailoredCVOut:
    # ``keywords`` without the "jobs" feature is refused as if the option
    # did not exist, as on REST (ADR-0018).
    if args.tailoring == 'keywords' and not await user_has_feature(
        FeatureKey.JOBS, ctx.caller.user, FeatureRepository(ctx.session)
    ):
        raise BusinessRuleViolation(
            UNKNOWN_TAILORING, ErrorCode.CV_UNKNOWN_TAILORING
        )
    tailored, applications = _repos(ctx)
    use_case = CreateTailoredCVUseCase(
        tailored, BaseCVRepository(ctx.session), applications, resolve_tailoring
    )
    copy = await use_case.execute(
        TailoredCVCreateDTO(
            user_id=ctx.user_id,
            application_id=args.application_id,
            base_cv_id=args.base_cv_id,
            tailoring=args.tailoring,
        )
    )
    return TailoredCVOut.model_validate(copy)


async def edit_application_cv(
    ctx: ToolContext, args: EditApplicationCvIn
) -> TailoredCVOut:
    current = await GetTailoredCVUseCase(*_repos(ctx)).execute(
        args.application_id, ctx.user_id
    )
    stored = TailoredCVOut.model_validate(current).model_dump()
    sent = args.model_dump(exclude_unset=True, exclude={'application_id'})
    payload = TailoredCVUpdate.model_validate({
        field: sent[field] if field in sent else stored[field]
        for field in TailoredCVUpdate.model_fields
    })
    copy = await UpdateTailoredCVUseCase(*_repos(ctx)).execute(
        args.application_id,
        ctx.user_id,
        TailoredCVUpdateDTO(**payload.model_dump()),
    )
    return TailoredCVOut.model_validate(copy)


async def delete_application_cv(
    ctx: ToolContext, args: ApplicationRef
) -> dict[str, Any]:
    await DeleteTailoredCVUseCase(*_repos(ctx)).execute(
        args.application_id, ctx.user_id
    )
    return deleted()


_ONE = object_output(TailoredCVOut)

TOOLS = (
    McpTool(
        name='get_application_cv',
        title='Get application CV',
        description="An application's CV copy, every section.",
        scope=McpScope.READ,
        needs_cvs=True,
        input_model=ApplicationRef,
        handler=get_application_cv,
        output_schema=_ONE,
    ),
    McpTool(
        name='download_application_cv',
        title='Download application CV',
        description=(
            "An application's CV copy as Markdown text, or as a PDF (an "
            'embedded application/pdf resource, base64).'
        ),
        scope=McpScope.READ,
        needs_cvs=True,
        input_model=ApplicationCvExportIn,
        handler=download_application_cv,
    ),
    McpTool(
        name='diff_application_cv',
        title='Show application CV changes',
        description=(
            "What changed between an application's CV copy and the master "
            'CV it came from, as Markdown text or a PDF.'
        ),
        scope=McpScope.READ,
        needs_cvs=True,
        input_model=ApplicationCvExportIn,
        handler=diff_application_cv,
    ),
    McpTool(
        name='create_application_cv',
        title='Create application CV',
        description=(
            'Copy one of your master CVs (base_cv_id) onto an application '
            '(one copy per application). Then tailor it with '
            'edit_application_cv.'
        ),
        scope=McpScope.WRITE,
        needs_cvs=True,
        input_model=CreateApplicationCvIn,
        handler=create_application_cv,
        output_schema=_ONE,
    ),
    McpTool(
        name='edit_application_cv',
        title='Edit application CV',
        description=(
            "Change an application's CV copy. Only the fields you send "
            'change; a section you send replaces that whole section. The '
            'master CV is never touched. Section items without an id get '
            'one.'
        ),
        scope=McpScope.WRITE,
        needs_cvs=True,
        input_model=EditApplicationCvIn,
        handler=edit_application_cv,
        output_schema=_ONE,
        prepare=assign_item_ids,
        input_schema_hook=item_ids_optional,
    ),
    McpTool(
        name='delete_application_cv',
        title='Delete application CV',
        description=(
            "Delete an application's CV copy for good. Ask the user first."
        ),
        scope=McpScope.DELETE,
        needs_cvs=True,
        input_model=ApplicationRef,
        handler=delete_application_cv,
        output_schema=DELETED_OUTPUT,
    ),
)
