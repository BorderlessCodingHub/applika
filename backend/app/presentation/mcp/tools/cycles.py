"""``list_cycles``: the user's archived job-search cycles, as
``GET /cycles`` answers them, so an AI can find the ``cycle_id`` that
``list_applications`` takes for one of them."""

from app.application.use_cases.cycles.list_cycles import ListCyclesUseCase
from app.core.mcp_scopes import McpScope
from app.domain.repositories.cycle_repository import CycleRepository
from app.presentation.mcp.registry import McpTool, ToolContext, list_output
from app.presentation.mcp.tools.common import NoInput
from app.presentation.schemas.cycle import Cycle


async def list_cycles(ctx: ToolContext, _: NoInput) -> list[Cycle]:
    use_case = ListCyclesUseCase(CycleRepository(ctx.session))
    cycles = await use_case.execute(ctx.user_id)
    return [
        Cycle.model_validate(cycle.model_dump(exclude={'user_id'}))
        for cycle in cycles
    ]


TOOLS = (
    McpTool(
        name='list_cycles',
        title='List cycles',
        description=(
            'Your archived job-search cycles (id, name, when archived). '
            'The current cycle is not one of them. Pass a cycle id as '
            'cycle_id to list_applications to read that cycle.'
        ),
        scope=McpScope.READ,
        input_model=NoInput,
        handler=list_cycles,
        output_schema=list_output(Cycle),
    ),
)
