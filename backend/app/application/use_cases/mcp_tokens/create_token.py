"""Create an MCP token (ADR-0028): one ``user_sessions`` row, ``mcp`` /
``mcp_token``, with the user's name for it and its scope; then its Redis
keys. The token is answered once and never stored, only its sha256."""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from app.application.services.session_store import SessionStore
from app.application.use_cases.sessions.open_session import (
    DEVICE_NAME_MAX,
    IP_MAX,
)
from app.config.settings import envs
from app.core.exceptions import SessionServiceUnavailable
from app.core.mcp_scopes import McpScope, serialize_scope
from app.domain.models import UserSessionModel
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

DEFAULT_TOKEN_NAME = 'MCP connection'


def mcp_expiry(now: datetime) -> datetime:
    """An MCP token ends ``MCP_TOKEN_IDLE_DAYS`` after its last use."""
    return now + timedelta(days=envs.MCP_TOKEN_IDLE_DAYS)


def token_name(name: str | None) -> str:
    """The name the user gave, trimmed, else ``MCP connection``."""
    given = (name or '').strip()
    return given[:DEVICE_NAME_MAX] if given else DEFAULT_TOKEN_NAME


class CreateMcpTokenUseCase:
    """One token, one connection: the row first, then the Redis keys."""

    def __init__(
        self, session_repo: UserSessionRepository, store: SessionStore
    ):
        self.session_repo = session_repo
        self.store = store

    async def execute(
        self,
        user_id: int,
        name: str | None,
        scope: Iterable[McpScope],
        ip: str | None,
    ) -> tuple[UserSessionModel, str]:
        expires_at = mcp_expiry(datetime.now(UTC))
        ip = ip[:IP_MAX] if ip else None
        stored_scope = serialize_scope(scope)
        row = await self.session_repo.create(
            user_id=user_id,
            client_type='mcp',
            sign_in_method='mcp_token',
            device_name=token_name(name),
            user_agent=None,
            ip=ip,
            expires_at=expires_at,
            scope=stored_scope,
        )
        try:
            token = await self.store.open_mcp(
                session_id=row.id,
                user_id=user_id,
                scope=stored_scope,
                expires_at=expires_at,
                last_ip=ip,
            )
        except SessionServiceUnavailable:
            # Nothing went live (503): drop the row so Devices never lists
            # a connection that never worked.
            await self.session_repo.delete(row.id)
            raise
        return row, token
