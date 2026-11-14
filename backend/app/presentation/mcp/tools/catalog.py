"""Platform and company lookups: the public rows plus the user's own
private rows, as the web shows them (ADR-0014)."""

from app.application.use_cases.companies.list_companies import (
    ListCompaniesUseCase,
)
from app.application.use_cases.platforms.list_platforms import (
    ListPlatformsUseCase,
)
from app.core.mcp_scopes import McpScope
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository
from app.presentation.mcp.registry import McpTool, ToolContext, list_output
from app.presentation.mcp.tools.common import ToolInput
from app.presentation.schemas.company import Company
from app.presentation.schemas.platform import PlatformOut


class NameFilter(ToolInput):
    name: str | None = None


async def list_platforms(
    ctx: ToolContext, args: NameFilter
) -> list[PlatformOut]:
    use_case = ListPlatformsUseCase(PlatformRepository(ctx.session))
    dtos = await use_case.execute(ctx.user_id, name=args.name)
    return [PlatformOut.model_validate(dto) for dto in dtos]


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
        name='search_companies',
        title='Search companies',
        description=(
            'Companies an application can name: the public ones plus your '
            'own. Optional name filter (case-insensitive, partial).'
        ),
        scope=McpScope.READ,
        input_model=NameFilter,
        handler=search_companies,
        output_schema=list_output(Company),
    ),
)
