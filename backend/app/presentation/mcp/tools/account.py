"""``whoami`` (applika-cli ``auth status``): who this token acts as."""

from pydantic import EmailStr

from app.core.mcp_scopes import McpScope
from app.lib.types import SnowflakeID
from app.presentation.mcp.registry import McpTool, ToolContext, object_output
from app.presentation.mcp.tools.common import NoInput
from app.presentation.schemas import BaseSchema


class WhoAmI(BaseSchema):
    """The account fields of ``GET /users/me`` the CLI showed."""

    id: SnowflakeID
    username: str
    name: str | None
    email: EmailStr


def _full_name(first: str | None, last: str | None) -> str | None:
    name = ' '.join(part for part in (first, last) if part)
    return name or None


async def whoami(ctx: ToolContext, _: NoInput) -> WhoAmI:
    user = ctx.caller.user
    return WhoAmI(
        id=SnowflakeID(user.id),
        username=user.username,
        name=_full_name(user.first_name, user.last_name),
        email=user.email,
    )


TOOLS = (
    McpTool(
        name='whoami',
        title='Who am I',
        description=(
            'The Applika account this connection acts as: id, username, '
            'name and email.'
        ),
        scope=McpScope.READ,
        input_model=NoInput,
        handler=whoami,
        output_schema=object_output(WhoAmI),
    ),
)
