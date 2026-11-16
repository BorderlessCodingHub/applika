"""MCP tokens (ADR-0028): a signed-in web user creates one for their own
account and sees it once. It is listed and revoked with the other devices
(``/users/me/sessions``).

Every user has this route: the owner chose "mcp will be released to
everyone, no beta gated" (ADR-0028, the exception to ADR-0018), so no
``require_feature`` sits here. An MCP token cannot call it: REST reads only
a session JWT, and an MCP token is none (401).
"""

from fastapi import APIRouter, Request, Response, status

from app.core.mcp_scopes import scope_names
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CreateMcpTokenUseCaseDp,
    CurrentUserDp,
    client_ip,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.mcp_tokens import (
    McpTokenCreate,
    McpTokenCreated,
)

router = APIRouter(prefix='/users/me/mcp-tokens', tags=['Devices'])


@router.post(
    '',
    response_model=McpTokenCreated,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {'model': DetailSchema},
        503: {'model': DetailSchema, 'description': 'Session store down'},
    },
)
async def create_mcp_token(
    payload: McpTokenCreate,
    request: Request,
    response: Response,
    c_user: CurrentUserDp,
    use_case: CreateMcpTokenUseCaseDp,
):
    """Create an MCP token with a name and a scope (``read`` always in it).
    The answer carries the token in full, once, with ``Cache-Control:
    no-store``; it ends 90 days after its last use."""
    row, token = await use_case.execute(
        c_user.id, payload.name, payload.scopes(), client_ip(request)
    )
    response.headers['Cache-Control'] = 'no-store'
    return McpTokenCreated(
        id=SnowflakeID(row.id),
        name=row.device_name,
        scope=scope_names(row.scope) or [],
        token=token,
        created_at=row.created_at,
        expires_at=row.expires_at,
    )
