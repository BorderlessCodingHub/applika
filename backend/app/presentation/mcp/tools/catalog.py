"""Platform and company lookups: the public rows plus the user's own
private rows, as the web shows them (ADR-0014). ``create_platform`` adds a
private platform, as the web's "add a platform" does (``POST /platforms``);
a company needs no tool of its own, ``create_application`` creates it from
``{name, url}``."""

from app.application.dto.platform import PlatformCreateDTO
from app.application.use_cases.companies.list_companies import (
    ListCompaniesUseCase,
)
from app.application.use_cases.platforms.create_platform import (
    CreatePlatformUseCase,
)
from app.application.use_cases.platforms.list_platforms import (
    ListPlatformsUseCase,
)
from app.core.mcp_scopes import McpScope
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository
from app.presentation.mcp.registry import (
    McpTool,
    ToolContext,
    list_output,
    object_output,
)
from app.presentation.mcp.tools.common import ToolInput
from app.presentation.schemas.company import Company
from app.presentation.schemas.platform import PlatformCreate, PlatformOut


class NameFilter(ToolInput):
    name: str | None = None


class CreatePlatformIn(PlatformCreate):
    pass


async def list_platforms(
    ctx: ToolContext, args: NameFilter
) -> list[PlatformOut]:
    use_case = ListPlatformsUseCase(PlatformRepository(ctx.session))
    dtos = await use_case.execute(ctx.user_id, name=args.name)
    return [PlatformOut.model_validate(dto) for dto in dtos]


async def create_platform(
    ctx: ToolContext, args: CreatePlatformIn
) -> PlatformOut:
    use_case = CreatePlatformUseCase(PlatformRepository(ctx.session))
    data = PlatformCreateDTO(
        name=args.name, url=str(args.url) if args.url else None
    )
    return PlatformOut.model_validate(await use_case.execute(data, ctx.user_id))


async def search_companies(ctx: ToolContext, args: NameFilter) -> list[Company]:
    use_case = ListCompaniesUseCase(CompanyRepository(ctx.session))
    dtos = await use_case.execute(ctx.user_id, name=args.name)
    return [Company.model_validate(dto) for dto in dtos]


TOOLS = (
    McpTool(
        name='list_platforms',
        title='List platforms',
        description=(
            'Job platforms (LinkedIn, Indeed, ...) an application can name: '
            'the public ones plus your own. Optional name filter '
            '(case-insensitive, partial).'
        ),
        scope=McpScope.READ,
        input_model=NameFilter,
        handler=list_platforms,
        output_schema=list_output(PlatformOut),
    ),
    McpTool(
        name='create_platform',
        title='Create platform',
        description=(
            'Add a job platform (name, optional url), only after '
            'list_platforms shows no platform for that site: reuse an '
            'existing one rather than adding a second. It is private to '
            'you; its id is the platform_id for create_application. A name '
            'you already see, ignoring case, is refused with that platform '
            'named.'
        ),
        scope=McpScope.WRITE,
        input_model=CreatePlatformIn,
        handler=create_platform,
        output_schema=object_output(PlatformOut),
    ),
    McpTool(
        name='search_companies',
        title='Search companies',
        description=(
            'Companies an application can name: the public ones plus your '
            'own. Optional name filter (case-insensitive, partial). Call it '
            'before create_application and send a matching id as company, '
            'so the same company is not created twice.'
        ),
        scope=McpScope.READ,
        input_model=NameFilter,
        handler=search_companies,
        output_schema=list_output(Company),
    ),
)
