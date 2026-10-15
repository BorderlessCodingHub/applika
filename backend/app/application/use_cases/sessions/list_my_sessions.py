from datetime import UTC, datetime, timedelta
from typing import cast

from app.application.dto.user_session import (
    ClientType,
    SessionListItemDTO,
    SessionStatus,
    SignInMethod,
)
from app.application.services.session_store import LiveSession, SessionStore
from app.config.settings import envs
from app.core.user_agent import describe_user_agent
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

_SIGNED_OUT = frozenset({'logout', 'replaced'})
_REVOKED = frozenset({'revoked', 'github_revoked'})
_DEAD = LiveSession(alive=False)


def derive_status(
    end_reason: str | None,
    expires_at: datetime,
    alive: bool,
    now: datetime,
) -> SessionStatus:
    """``logout``/``replaced`` -> signed_out, ``revoked``/``github_revoked``
    -> revoked, ``expired`` -> expired; an open row is expired when its key
    is gone or it is past ``expires_at``, else active. Derived on read; the
    list never writes."""
    if end_reason in _SIGNED_OUT:
        return 'signed_out'
    if end_reason in _REVOKED:
        return 'revoked'
    if end_reason is not None:
        return 'expired'
    if not alive or expires_at <= now:
        return 'expired'
    return 'active'


class ListMySessionsUseCase:
    """The caller's devices: active ones by last use (newest first, never
    used last), then ended ones by when they ended (``coalesce(ended_at,
    expires_at)``, newest first) within ``SESSION_HISTORY_DAYS``. Active
    rows read their last use and IP live from Redis."""

    def __init__(
        self, session_repo: UserSessionRepository, store: SessionStore
    ):
        self.session_repo = session_repo
        self.store = store

    async def execute(
        self, user_id: int, current_session_id: int | None
    ) -> list[SessionListItemDTO]:
        now = datetime.now(UTC)
        since = now - timedelta(days=envs.SESSION_HISTORY_DAYS)
        rows = await self.session_repo.list_for_user(user_id, since)
        live = await self.store.live_fields([
            row.id for row in rows if row.ended_at is None
        ])

        active: list[SessionListItemDTO] = []
        ended: list[tuple[datetime, SessionListItemDTO]] = []
        for row in rows:
            state = live.get(row.id, _DEAD)
            status = derive_status(
                row.end_reason, row.expires_at, state.alive, now
            )
            last_used_at = row.last_used_at
            last_ip = row.last_ip
            if status == 'active':
                last_used_at = state.last_used_at or last_used_at
                last_ip = state.last_ip or last_ip
            item = SessionListItemDTO(
                id=row.id,
                client_type=cast(ClientType, row.client_type),
                sign_in_method=cast(SignInMethod, row.sign_in_method),
                device_name=row.device_name,
                client_label=describe_user_agent(row.user_agent),
                created_ip=row.created_ip,
                last_ip=last_ip,
                created_at=row.created_at,
                last_used_at=last_used_at,
                expires_at=row.expires_at,
                ended_at=row.ended_at,
                status=status,
                current=status == 'active' and row.id == current_session_id,
            )
            if status == 'active':
                active.append(item)
                continue
            ended_at = row.ended_at or row.expires_at
            if ended_at < since:
                continue
            ended.append((ended_at, item))

        active.sort(key=lambda item: item.id, reverse=True)
        active.sort(
            key=lambda item: (
                item.last_used_at is not None,
                item.last_used_at or now,
            ),
            reverse=True,
        )
        ended.sort(key=lambda pair: (pair[0], pair[1].id), reverse=True)
        return active + [item for _, item in ended]
