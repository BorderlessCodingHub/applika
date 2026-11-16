"""Master CV tools (applika-cli ``cvs list|get|new|edit|delete|download``),
over the use cases ``presentation/api/base_cv.py`` runs. Only for a user
with the ``cvs`` feature (``needs_cvs``): for anyone else they do not exist.

Another user's CV is a 404, admins included (ADR-0004). A save asks for a
fit recompute, best effort, as the REST route does.
"""

from typing import Any, Literal

from app.application.dto.base_cv import BaseCVCreateDTO, BaseCVUpdateDTO
from app.application.services.cv_rendering.markdown_renderer import (
    get_cv_markdown_renderer,
)
from app.application.services.cv_rendering.renderer import get_cv_pdf_renderer
from app.application.services.job_queue import request_fit_recompute
from app.application.use_cases.base_cvs.create import CreateBaseCVUseCase
from app.application.use_cases.base_cvs.delete import DeleteBaseCVUseCase
from app.application.use_cases.base_cvs.get import GetBaseCVUseCase
from app.application.use_cases.base_cvs.list import ListBaseCVsUseCase
from app.application.use_cases.base_cvs.render_markdown import (
    RenderBaseCVMarkdownUseCase,
)
from app.application.use_cases.base_cvs.render_pdf import (
    RenderBaseCVPdfUseCase,
)
from app.application.use_cases.base_cvs.update import UpdateBaseCVUseCase
from app.core.mcp_scopes import McpScope
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.lib.types import SnowflakeID
from app.presentation.mcp.deps import deps
from app.presentation.mcp.registry import (
    DELETED_OUTPUT,
    McpTool,
    ToolContext,
    deleted,
    list_output,
    markdown_result,
    object_output,
    pdf_result,
)
from app.presentation.mcp.tools.common import (
    NoInput,
    ToolInput,
    assign_item_ids,
    item_ids_optional,
)
from app.presentation.schemas.base_cv import (
    BaseCVCreate,
    BaseCVOut,
    BaseCVUpdate,
)

ExportFormat = Literal['markdown', 'pdf']


class CvRef(ToolInput):
    cv_id: SnowflakeID


class DownloadCvIn(CvRef):
    format: ExportFormat = 'markdown'


class CreateCvIn(BaseCVCreate):
    pass


class EditCvIn(BaseCVUpdate):
    cv_id: SnowflakeID


async def list_cvs(ctx: ToolContext, _: NoInput) -> list[BaseCVOut]:
    cvs = await ListBaseCVsUseCase(BaseCVRepository(ctx.session)).execute(
        ctx.user_id
    )
    return [BaseCVOut.model_validate(cv) for cv in cvs]


async def get_cv(ctx: ToolContext, args: CvRef) -> BaseCVOut:
    cv = await GetBaseCVUseCase(BaseCVRepository(ctx.session)).execute(
        args.cv_id, ctx.user_id
    )
    return BaseCVOut.model_validate(cv)


async def download_cv(ctx: ToolContext, args: DownloadCvIn) -> Any:
    repo = BaseCVRepository(ctx.session)
    if args.format == 'pdf':
        pdf = await RenderBaseCVPdfUseCase(repo, get_cv_pdf_renderer()).execute(
            args.cv_id, ctx.user_id
        )
        return pdf_result(pdf.content, pdf.filename)
    markdown = await RenderBaseCVMarkdownUseCase(
        repo, get_cv_markdown_renderer()
    ).execute(args.cv_id, ctx.user_id)
    return markdown_result(markdown.content)


async def create_cv(ctx: ToolContext, args: CreateCvIn) -> BaseCVOut:
    cv = await CreateBaseCVUseCase(BaseCVRepository(ctx.session)).execute(
        BaseCVCreateDTO(user_id=ctx.user_id, **args.model_dump())
    )
    await request_fit_recompute(deps.job_queue_factory(ctx.redis), cv.id)
    return BaseCVOut.model_validate(cv)


async def edit_cv(ctx: ToolContext, args: EditCvIn) -> BaseCVOut:
    data = BaseCVUpdateDTO(
        **args.model_dump(exclude_unset=True, exclude={'cv_id'})
    )
    cv = await UpdateBaseCVUseCase(BaseCVRepository(ctx.session)).execute(
        args.cv_id, ctx.user_id, data
    )
    await request_fit_recompute(deps.job_queue_factory(ctx.redis), cv.id)
    return BaseCVOut.model_validate(cv)


async def delete_cv(ctx: ToolContext, args: CvRef) -> dict[str, Any]:
    await DeleteBaseCVUseCase(BaseCVRepository(ctx.session)).execute(
        args.cv_id, ctx.user_id
    )
    return deleted()


_ONE = object_output(BaseCVOut)

TOOLS = (
    McpTool(
        name='list_cvs',
        title='List master CVs',
        description='Your master CVs (at most three).',
        scope=McpScope.READ,
        needs_cvs=True,
        input_model=NoInput,
        handler=list_cvs,
        output_schema=list_output(BaseCVOut),
    ),
    McpTool(
        name='get_cv',
        title='Get master CV',
        description='One of your master CVs, every section.',
        scope=McpScope.READ,
        needs_cvs=True,
        input_model=CvRef,
        handler=get_cv,
        output_schema=_ONE,
    ),
    McpTool(
        name='download_cv',
        title='Download master CV',
        description=(
            'A master CV as Markdown text, or as a PDF (an embedded '
            'application/pdf resource, base64).'
        ),
        scope=McpScope.READ,
        needs_cvs=True,
        input_model=DownloadCvIn,
        handler=download_cv,
    ),
    McpTool(
        name='create_cv',
        title='Create master CV',
        description=(
            'Create a master CV (at most three per user). Section items '
            'without an id get one.'
        ),
        scope=McpScope.WRITE,
        needs_cvs=True,
        input_model=CreateCvIn,
        handler=create_cv,
        output_schema=_ONE,
        prepare=assign_item_ids,
        input_schema_hook=item_ids_optional,
    ),
    McpTool(
        name='edit_cv',
        title='Edit master CV',
        description=(
            'Change a master CV. Only the fields you send change; a section '
            'you send replaces that whole section. Section items without '
            'an id get one.'
        ),
        scope=McpScope.WRITE,
        needs_cvs=True,
        input_model=EditCvIn,
        handler=edit_cv,
        output_schema=_ONE,
        prepare=assign_item_ids,
        input_schema_hook=item_ids_optional,
    ),
    McpTool(
        name='delete_cv',
        title='Delete master CV',
        description='Delete a master CV for good. Ask the user first.',
        scope=McpScope.DELETE,
        needs_cvs=True,
        input_model=CvRef,
        handler=delete_cv,
        output_schema=DELETED_OUTPUT,
    ),
)
