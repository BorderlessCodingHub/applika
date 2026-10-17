from datetime import UTC, datetime

from app.application.dto.user_session import EndReason
from app.application.services.session_store import SessionStore
from app.core.exceptions import ResourceNotFound
from app.domain.models import UserSessionModel
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

SESSION_NOT_FOUND = 'Session not found'


class EndSessionUseCase:
    """End one session: DEL both keys, then stamp the row with when and why,
    copying the live last use onto it (plan correction 9).

    Only a live session ends. A row already ended, past ``expires_at`` or
    whose key is gone is left as it is - it already reads as ended or
    expired - so ending it again is a no-op."""

    def __init__(
        self, session_repo: UserSessionRepository, store: SessionStore
    ):
        self.session_repo = session_repo
        self.store = store

    async def execute(
        self,
        user_id: int,
        session_id: int,
        reason: EndReason = 'revoked',
    ) -> bool:
        """The caller's own session, else 404 - for admins too
        (ADR-0004)."""
        row = await self.session_repo.get_own(session_id, user_id)
        if row is None:
            raise ResourceNotFound(SESSION_NOT_FOUND)
        return await self.end_row(row, reason)

    async def end_by_refresh(
        self,
        refresh_value: str | None,
        reason: EndReason,
        user_id: int | None = None,
    ) -> bool:
        """End the session a refresh value points at; with ``user_id``,
        only when that user owns it. Unknown values are a no-op."""
        if not refresh_value:
            return False
        session_id = await self.store.resolve_refresh(refresh_value)
        if session_id is None:
            return False
        row = await self.session_repo.get(session_id)
        if row is None:
            # A key with no row: nothing to show, nothing to keep.
            await self.store.end(session_id)
            return False
        if user_id is not None and row.user_id != user_id:
            return False
        return await self.end_row(row, reason)

    async def end_row(self, row: UserSessionModel, reason: EndReason) -> bool:
        now = datetime.now(UTC)
        session_id = row.id
        if row.ended_at is not None or row.expires_at <= now:
            return False
        live = await self.store.live(session_id)
        if not live.alive:
            return False
        await self.store.end(session_id)
        return await self.session_repo.end(
            session_id,
            reason,
            now,
            live.last_used_at,
            live.last_ip,
        )
