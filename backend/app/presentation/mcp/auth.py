"""The token check in front of ``/mcp`` (ADR-0028, ADR-0019).

``McpAuthGuard`` is an ASGI wrapper around the SDK session manager. It reads
``Authorization: Bearer applika_mcp_…``, runs the session check
(``AuthenticateMcpTokenUseCase``: the Redis touch, the 90-day slide) and
reads whether the user has the ``cvs`` feature, once per request. Then:

- the caller goes to ``scope['state']['mcp_principal']``; the tool
  handlers read it from ``server.request_context.request.state``;
- the same caller is set in ``current_caller`` for the one place no request
  reaches: the ``initialize`` answer's instructions, which the SDK builds
  from ``Server.create_initialization_options()`` in the task it starts for
  the request (anyio copies the request's context into it).

A JWT, a missing, unknown, revoked or expired token answers 401
``AUTH-1051`` with ``WWW-Authenticate: Bearer``; a Redis failure 503
``AUTH-1003`` with ``Retry-After: 5`` (fail closed). The token is never
logged. No OAuth: ``AuthSettings`` is not used (PRD 0023 non-goals).
"""

from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.application.dto.user import UserDTO
from app.application.services.session_store import SessionStore
from app.application.use_cases.mcp_tokens.authenticate import (
    AuthenticateMcpTokenUseCase,
    McpPrincipal,
)
from app.core.exceptions import InvalidSession, SessionServiceUnavailable
from app.core.features import FeatureKey
from app.core.mcp_scopes import McpScope
from app.domain.repositories.feature_repository import FeatureRepository
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)
from app.presentation.handlers import error_answer
from app.presentation.mcp.deps import deps

PRINCIPAL_STATE_KEY = 'mcp_principal'
WWW_AUTHENTICATE = 'Bearer'


@dataclass(frozen=True)
class McpCaller:
    """One request's caller: the token's principal, and whether its user
    has the ``cvs`` feature right now (read per request, never cached)."""

    principal: McpPrincipal
    has_cvs: bool

    @property
    def user(self) -> UserDTO:
        return self.principal.user

    @property
    def scopes(self) -> frozenset[McpScope]:
        return self.principal.scopes


current_caller: ContextVar[McpCaller | None] = ContextVar(
    'applika_mcp_caller', default=None
)


def bearer_token(headers: Mapping[str, str]) -> str | None:
    authorization = headers.get('authorization') or ''
    scheme, _, credentials = authorization.partition(' ')
    if scheme.lower() == 'bearer' and credentials.strip():
        return credentials.strip()
    return None


def _client_ip(scope: Scope) -> str | None:
    """The address uvicorn resolved, as ``client_ip`` reads it for REST."""
    client = scope.get('client')
    return client[0] if client else None


async def authenticate(scope: Scope) -> McpCaller:
    request = Request(scope)
    async with deps.session_factory() as session:
        use_case = AuthenticateMcpTokenUseCase(
            UserRepository(session),
            UserSessionRepository(session),
            SessionStore(deps.redis_factory()),
        )
        principal = await use_case.execute(
            bearer_token(request.headers), _client_ip(scope)
        )
        has_cvs = await FeatureRepository(session).has_feature(
            FeatureKey.CVS.value, principal.user.id, principal.user.is_admin
        )
    return McpCaller(principal=principal, has_cvs=has_cvs)


class McpAuthGuard:
    """Only a live MCP token reaches the wrapped app."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        try:
            caller = await authenticate(scope)
        except (InvalidSession, SessionServiceUnavailable) as exc:
            answer = error_answer(exc)
            assert answer is not None
            headers = dict(answer.headers or {})
            if isinstance(exc, InvalidSession):
                headers['WWW-Authenticate'] = WWW_AUTHENTICATE
            response = JSONResponse(
                status_code=answer.status_code,
                content=answer.body,
                headers=headers,
            )
            await response(scope, receive, send)
            return

        scope.setdefault('state', {})[PRINCIPAL_STATE_KEY] = caller
        token = current_caller.set(caller)
        try:
            await self.app(scope, receive, send)
        finally:
            current_caller.reset(token)
