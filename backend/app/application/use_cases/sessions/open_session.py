from datetime import UTC, datetime, timedelta

from app.application.dto.user_session import (
    ClientType,
    SessionTokensDTO,
    SignInMethod,
)
from app.application.services.session_store import SessionStore
from app.config.settings import envs
from app.core.exceptions import SessionServiceUnavailable
from app.core.tokens import create_access_token
from app.core.user_agent import describe_user_agent
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

DEVICE_NAME_MAX = 100
USER_AGENT_MAX = 512
IP_MAX = 45


def refresh_window_seconds() -> int:
    return envs.REFRESH_TOKEN_EXPIRE_DAYS * 86400


def next_expiry(now: datetime) -> datetime:
    """A session ends ``REFRESH_TOKEN_EXPIRE_DAYS`` after its last refresh
    (sliding, owner 2026-10-15)."""
    return now + timedelta(days=envs.REFRESH_TOKEN_EXPIRE_DAYS)


def session_tokens(
    session_id: int, user_id: int, refresh_value: str
) -> SessionTokensDTO:
    """A fresh access JWT for the session, with its unchanged refresh
    value."""
    access_token, _, access_expires_in = create_access_token(
        str(user_id), str(session_id)
    )
    return SessionTokensDTO(
        session_id=session_id,
        user_id=user_id,
        access_token=access_token,
        access_expires_in=access_expires_in,
        refresh_token=refresh_value,
        refresh_expires_in=refresh_window_seconds(),
    )


def device_name_for(device_name: str | None, user_agent: str | None) -> str:
    """The name the user gave, else one derived from the user agent."""
    given = (device_name or '').strip()
    if given:
        return given[:DEVICE_NAME_MAX]
    return describe_user_agent(user_agent)[:DEVICE_NAME_MAX]


class OpenSessionUseCase:
    """One sign-in, one device: the row first, then the Redis keys."""

    def __init__(
        self, session_repo: UserSessionRepository, store: SessionStore
    ):
        self.session_repo = session_repo
        self.store = store

    async def execute(
        self,
        *,
        user_id: int,
        client_type: ClientType,
        sign_in_method: SignInMethod,
        user_agent: str | None,
        ip: str | None,
        device_name: str | None = None,
    ) -> SessionTokensDTO:
        expires_at = next_expiry(datetime.now(UTC))
        ip = ip[:IP_MAX] if ip else None
        row = await self.session_repo.create(
            user_id=user_id,
            client_type=client_type,
            sign_in_method=sign_in_method,
            device_name=device_name_for(device_name, user_agent),
            user_agent=user_agent[:USER_AGENT_MAX] if user_agent else None,
            ip=ip,
            expires_at=expires_at,
        )
        session_id = row.id
        try:
            refresh_value = await self.store.open(
                session_id=session_id,
                user_id=user_id,
                expires_at=expires_at,
                last_ip=ip,
            )
        except SessionServiceUnavailable:
            # The sign-in failed (503): drop the row so the device list
            # never shows a session that was never live.
            await self.session_repo.delete(session_id)
            raise
        return session_tokens(session_id, user_id, refresh_value)
