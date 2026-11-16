"""Application tools (applika-cli ``applications list|new|edit|finalize|
reopen``), over the use cases ``presentation/api/application.py`` runs.

Every tool acts on the caller's own applications only: another user's is
the 404 ``APP-1001``, admins included (ADR-0004). ``edit_application``
merges what is sent onto the stored application, as the CLI did, then sends
the full replace the REST ``PUT`` expects.
"""

from datetime import date
from typing import Any, Literal

from app.application.dto.application import (
    ApplicationCreateDTO,
    FinalizeOutcomeDTO,
)
from app.application.use_cases.applications.create_application import (
    CreateApplicationUseCase,
)
from app.application.use_cases.applications.finalize_application import (
    APPLICATION_NOT_FOUND,
    FinalizeApplicationUseCase,
    FinalizeApplicationWithOutcomeUseCase,
)
from app.application.use_cases.applications.list_applications import (
    ListApplicationsUseCase,
)
from app.application.use_cases.applications.reopen_application import (
    ReopenApplicationUseCase,
)
from app.application.use_cases.applications.update_application import (
    UpdateApplicationUseCase,
)
from app.application.use_cases.platforms.list_platforms import (
    ListPlatformsUseCase,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.core.mcp_scopes import McpScope
from app.domain.models import ApplicationModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.cycle_repository import CycleRepository
from app.domain.repositories.platform_repository import PlatformRepository
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)
from app.lib.types import SnowflakeID
from app.presentation.api.application import (
    _build_update_dto,  # the REST PUT's own mapping (sticky fields)
)
from app.presentation.mcp.filters import (
    ModeFilter,
    StatusFilter,
    filter_applications,
    resolve_platform_id,
)
from app.presentation.mcp.registry import (
    McpTool,
    ToolContext,
    list_output,
    object_output,
)
from app.presentation.mcp.tools.common import (
    ApplicationRef,
    ToolInput,
    partial_model,
    read_model,
)
from app.presentation.schemas.application import (
    Application,
    CreateApplication,
    FinalizeWithOutcome,
    UpdateApplication,
)

# The nullable fields ``edit_application`` can clear; ``salary`` clears the
# five salary fields at once (the CLI's ``--clear salary``).
ClearField = Literal[
    'link_to_job',
    'observation',
    'expected_salary',
    'salary_range_min',
    'salary_range_max',
    'currency',
    'salary_period',
    'experience_level',
    'work_mode',
    'country',
    'job_description',
    'salary',
]
SALARY_FIELDS = (
    'expected_salary',
    'salary_range_min',
    'salary_range_max',
    'currency',
    'salary_period',
)
CYCLE_NOT_FOUND = 'Cycle not found or not owned by user'
# Sticky on the REST PUT: omitted, the stored text stays.
STICKY_FIELDS = frozenset({'job_description'})


class ListApplicationsIn(ToolInput):
    cycle_id: SnowflakeID | None = None
    search: str | None = None
    mode: ModeFilter = ModeFilter.ALL
    status: StatusFilter = StatusFilter.ALL
    platform: str | None = None
    from_date: date | None = None
    to_date: date | None = None


class CreateApplicationIn(CreateApplication):
    pass


EditApplicationIn = partial_model(
    'EditApplicationIn',
    UpdateApplication,
    {
        'application_id': (SnowflakeID, ...),
        'clear': (list[ClearField], []),
    },
)


class FinalizeApplicationIn(FinalizeWithOutcome):
    application_id: SnowflakeID


async def _own_application(
    app_repo: ApplicationRepository, application_id: int, user_id: int
) -> ApplicationModel:
    application = await app_repo.get_by_id_and_user_id(application_id, user_id)
    if application is None:
        raise ResourceNotFound(
            APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
        )
    return application


async def list_applications(
    ctx: ToolContext, args: ListApplicationsIn
) -> list[Application]:
    if args.cycle_id is not None:
        # REST answers an unknown cycle with an empty list; a model cannot
        # tell that from an empty cycle, so the tool says it is unknown.
        cycle = await CycleRepository(ctx.session).get_by_id_and_user_id(
            args.cycle_id, ctx.user_id
        )
        if cycle is None:
            raise ResourceNotFound(
                CYCLE_NOT_FOUND, ErrorCode.CYC_CYCLE_NOT_FOUND
            )
    use_case = ListApplicationsUseCase(
        ApplicationRepository(ctx.session), read_model(ctx.session)
    )
    dtos = await use_case.execute(
        ctx.user_id,
        cycle_id=int(args.cycle_id) if args.cycle_id else None,
    )
    platform_id = None
    if args.platform:
        platforms = await ListPlatformsUseCase(
            PlatformRepository(ctx.session)
        ).execute(ctx.user_id)
        platform_id = resolve_platform_id(platforms, args.platform)
    return filter_applications(
        [Application.model_validate(dto) for dto in dtos],
        search=args.search,
        mode=args.mode,
        status=args.status,
        platform_id=platform_id,
        from_date=args.from_date,
        to_date=args.to_date,
    )


async def get_application(
    ctx: ToolContext, args: ApplicationRef
) -> Application:
    application = await _own_application(
        ApplicationRepository(ctx.session), args.application_id, ctx.user_id
    )
    dto = await read_model(ctx.session).one(application)
    return Application.model_validate(dto)


async def create_application(
    ctx: ToolContext, args: CreateApplicationIn
) -> Application:
    use_case = CreateApplicationUseCase(
        ApplicationRepository(ctx.session),
        PlatformRepository(ctx.session),
        CompanyRepository(ctx.session),
    )
    company = (
        args.company
        if isinstance(args.company, int)
        else args.company.model_dump()
    )
    data = ApplicationCreateDTO(
        **args.model_dump(exclude={'company'}),
        company=company,
        user_id=ctx.user_id,
    )
    return Application.model_validate(await use_case.execute(data))


def _merged_update(
    sent: dict[str, Any], current: Application, clear: list[str]
) -> UpdateApplication:
    """The full ``PUT`` body: what was sent, else what is stored; cleared
    fields null. The sticky ``job_description`` is sent only when given or
    cleared, so the stored text stays otherwise."""
    stored = current.model_dump()
    merged: dict[str, Any] = {}
    for field in UpdateApplication.model_fields:
        if field in sent:
            merged[field] = sent[field]
        elif field == 'company':
            merged[field] = (
                current.company_id
                if current.company_id
                else {'name': current.company_name, 'url': None}
            )
        elif field not in STICKY_FIELDS:
            merged[field] = stored.get(field)
    for name in clear:
        for field in SALARY_FIELDS if name == 'salary' else (name,):
            merged[field] = None
    return UpdateApplication.model_validate(merged)


async def edit_application(ctx: ToolContext, args: Any) -> Application:
    app_repo = ApplicationRepository(ctx.session)
    model = read_model(ctx.session)
    application = await _own_application(
        app_repo, args.application_id, ctx.user_id
    )
    current = Application.model_validate(await model.one(application))
    # The parsed values, not a dump: ``SnowflakeID``'s serializer would turn
    # a ``{name, url}`` company into its string form.
    sent = {
        field: getattr(args, field)
        for field in set(UpdateApplication.model_fields) & args.model_fields_set
    }
    payload = _merged_update(sent, current, list(args.clear))
    use_case = UpdateApplicationUseCase(
        app_repo,
        PlatformRepository(ctx.session),
        CompanyRepository(ctx.session),
        model,
    )
    updated = await use_case.execute(
        args.application_id, _build_update_dto(payload, ctx.user_id)
    )
    return Application.model_validate(updated)


async def finalize_application(
    ctx: ToolContext, args: FinalizeApplicationIn
) -> Application:
    """No outcome: the plain close (idempotent). An outcome: the ``offer`` or
    ``denied`` event and the close in one write (the REST finalize)."""
    app_repo = ApplicationRepository(ctx.session)
    model = read_model(ctx.session)
    if args.outcome is None:
        closed = await FinalizeApplicationUseCase(app_repo, model).execute(
            args.application_id, ctx.user_id
        )
        return Application.model_validate(closed)
    use_case = FinalizeApplicationWithOutcomeUseCase(
        app_repo, TimelineEventRepository(ctx.session), model
    )
    closed = await use_case.execute(
        args.application_id,
        ctx.user_id,
        FinalizeOutcomeDTO(**args.model_dump(exclude={'application_id'})),
    )
    return Application.model_validate(closed)


async def reopen_application(
    ctx: ToolContext, args: ApplicationRef
) -> Application:
    use_case = ReopenApplicationUseCase(
        ApplicationRepository(ctx.session), read_model(ctx.session)
    )
    reopened = await use_case.execute(args.application_id, ctx.user_id)
    return Application.model_validate(reopened)


_ONE = object_output(Application)

TOOLS = (
    McpTool(
        name='list_applications',
        title='List applications',
        description=(
            'Your job applications in the current cycle, or in an archived '
            'one with cycle_id (from list_cycles), '
            'newest first. Filters: search (company or role, '
            'case-insensitive), mode (active|passive|all), status '
            '(active = open, finalized = closed, all), platform (name or '
            'id), from_date and to_date (YYYY-MM-DD, inclusive).'
        ),
        scope=McpScope.READ,
        input_model=ListApplicationsIn,
        handler=list_applications,
        output_schema=list_output(Application),
    ),
    McpTool(
        name='get_application',
        title='Get application',
        description='One of your applications by id.',
        scope=McpScope.READ,
        input_model=ApplicationRef,
        handler=get_application,
        output_schema=_ONE,
    ),
    McpTool(
        name='create_application',
        title='Create application',
        description=(
            'Record a new job application. company is a company id from '
            'search_companies, or {name, url} only when no listed company '
            'is that company (it reuses an exact name and url match, else '
            'creates one); platform_id comes from list_platforms, or from '
            'create_platform when no listed platform is that site. Always '
            'look both up first and reuse an existing id. mode is active '
            '(you applied) or passive (a recruiter reached you).'
        ),
        scope=McpScope.WRITE,
        input_model=CreateApplicationIn,
        handler=create_application,
        output_schema=_ONE,
    ),
    McpTool(
        name='edit_application',
        title='Edit application',
        description=(
            'Change an application. Only the fields you send change; the '
            'rest keep their stored values. Send a field as null, or name '
            'it in clear, to empty it (clear: salary empties the five '
            'salary fields).'
        ),
        scope=McpScope.WRITE,
        input_model=EditApplicationIn,
        handler=edit_application,
        output_schema=_ONE,
    ),
    McpTool(
        name='finalize_application',
        title='Close application',
        description=(
            'Close an application. With no outcome it just closes. With '
            'outcome offer (salary_amount, salary_currency and '
            'salary_period monthly|annually required) or denied '
            '(denied_reason optional) it also records that event, on '
            "event_date (not in the future; absent, today's UTC date, so "
            "send the user's local date). Reopen it with "
            'reopen_application.'
        ),
        scope=McpScope.WRITE,
        input_model=FinalizeApplicationIn,
        handler=finalize_application,
        output_schema=_ONE,
    ),
    McpTool(
        name='reopen_application',
        title='Reopen application',
        description=(
            'Reopen a closed application so its timeline can be edited '
            'again. Reopening an open one changes nothing.'
        ),
        scope=McpScope.WRITE,
        input_model=ApplicationRef,
        handler=reopen_application,
        output_schema=_ONE,
    ),
)
