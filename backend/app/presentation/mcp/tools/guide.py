"""``guide`` (ADR-0028, amendment 1): the server's instructions as a tool.

The same text the ``initialize`` answer carries, for this caller's scope and
``cvs`` feature. Some AI apps never show a server's instructions to the
model; every app shows its tools.

Every other tool's answer, a refusal included, carries a short tip about
``guide``: as the last text block of its content, which the model reads, and
in its ``_meta`` (``with_guide_tip``, applied by ``server.py``)."""

from mcp import types

from app.core.mcp_scopes import McpScope
from app.presentation.mcp.instructions import build_instructions
from app.presentation.mcp.registry import (
    McpTool,
    ToolContext,
    markdown_result,
)
from app.presentation.mcp.tools.common import NoInput

GUIDE = 'guide'
# What AI apps show for ``guide``: most list a tool by its title, so the
# tip and the instructions name both.
GUIDE_TITLE = 'How to use Applika'
TIP_KEY = 'applika.dev/tip'
TIP = (
    'Unsure which tool to call next, or how? Call the `guide` tool '
    f'(shown as "{GUIDE_TITLE}"): it returns the instructions for this '
    'server.'
)


def with_guide_tip(
    name: str, answer: types.CallToolResult
) -> types.CallToolResult:
    """``answer`` with the tip appended to its content and set in its
    ``_meta``; ``guide``'s own answer stays as it is."""
    if name == GUIDE:
        return answer
    return answer.model_copy(
        update={
            'content': [
                *answer.content,
                types.TextContent(type='text', text=TIP),
            ],
            'meta': {**(answer.meta or {}), TIP_KEY: TIP},
        }
    )


async def guide(ctx: ToolContext, _: NoInput) -> types.CallToolResult:
    return markdown_result(build_instructions(ctx.caller))


TOOLS = (
    McpTool(
        name=GUIDE,
        title=GUIDE_TITLE,
        description=(
            'Returns the instructions on how to use this Applika MCP server: '
            'what each tool does, the values its arguments take, the order '
            'to call them in and the common workflows, for this '
            "connection's access. Whenever you are unsure which tool to "
            'call, or how to call it, call this tool first and it will '
            'guide you.'
        ),
        scope=McpScope.READ,
        input_model=NoInput,
        handler=guide,
    ),
)
