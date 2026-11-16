"""The MCP server's session check (ADR-0028, ADR-0019): every call on
``/mcp`` resolves its token in Redis, stamps the use, and slides the end
``MCP_TOKEN_IDLE_DAYS`` on; Postgres follows at most once a day.

Only an MCP token passes: a JWT, a token of the wrong shape, an unknown,
revoked or expired one all answer 401 ``AUTH-1051``. A store failure
raises ``SessionServiceUnavailable`` (503, fail closed). The token is
never logged."""

import re
from dataclasses import dataclass
from datetime import UTC, datetime

from app.application.dto.user import UserDTO
from app.application.services.session_store import SessionStore
from app.application.use_cases.mcp_tokens.create_token import mcp_expiry
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import InvalidSession
from app.core.mcp_scopes import McpScope, held_scopes
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

MCP_TOKEN_INVALID = (
    'MCP token invalid, revoked or expired. '
    'Create a new one in Applika: Profile > MCP.'
)
USER_NOT_FOUND = 'User not found'

# ``applika_mcp_`` + 43 base64url characters (32 random bytes).
MCP_TOKEN_SHAPE = re.compile(r'applika_mcp_[A-Za-z0-9_-]{43}')


@dataclass(frozen=True)
class McpPrincipal:
    """Who an MCP call acts as, and what its token's scope allows."""

    user: UserDTO
    session_id: int
    scopes: frozenset[McpScope]


def is_mcp_token_shape(token: str | None) -> bool:
    return bool(token) and MCP_TOKEN_SHAPE.fullmatch(token or '') is not None


def _token_invalid(reason: str) -> InvalidSession:
    logger.info(
        'MCP auth failed',
        extra={'extra_data': {'event': 'mcp_auth_failed', 'reason': reason}},
    )
    return InvalidSession(MCP_TOKEN_INVALID, ErrorCode.AUTH_MCP_TOKEN_INVALID)


class AuthenticateMcpTokenUseCase:
    def __init__(
        self,
        user_repo: UserRepository,
        session_repo: UserSessionRepository,
        store: SessionStore,
    ):
        self.user_repo = user_repo
        self.session_repo = session_repo
        self.store = store

    async def execute(self, token: str | None, ip: str | None) -> McpPrincipal:
        if not is_mcp_token_shape(token):
            raise _token_invalid('not_an_mcp_token')
        assert token is not None
        now = datetime.now(UTC)
        slide_to = mcp_expiry(now)
        found = await self.store.resolve_mcp(token, ip, slide_to, now)
        if found is None:
            raise _token_invalid('session_gone')
        user = await self.user_repo.get_by_id(found.user_id)
        if user is None:
            await self.store.end(found.session_id)
            raise InvalidSession(USER_NOT_FOUND, ErrorCode.AUTH_USER_GONE)
        await self.session_repo.bump_expires_at(found.session_id, slide_to)
        return McpPrincipal(
            user=UserDTO.model_validate(user),
            session_id=found.session_id,
            scopes=held_scopes(found.scope),
        )
