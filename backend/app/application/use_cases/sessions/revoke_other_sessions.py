from app.application.services.session_store import SessionStore
from app.application.use_cases.sessions.end_session import EndSessionUseCase
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)


class RevokeOtherSessionsUseCase:
    """Sign out every other device of the caller in one action (R-012)."""

    def __init__(
        self, session_repo: UserSessionRepository, store: SessionStore
    ):
        self.session_repo = session_repo
        self.store = store
        self.end_session = EndSessionUseCase(session_repo, store)

    async def execute(
        self, user_id: int, current_session_id: int | None
    ) -> int:
        """End every live session but the current one as ``revoked``;
        answers how many ended."""
        revoked = 0
        for row in await self.session_repo.list_open(user_id):
            if row.id == current_session_id:
                continue
            if await self.end_session.end_row(row, 'revoked'):
                revoked += 1
        return revoked

    async def end_all_keys(self, user_id: int) -> None:
        """Account delete (R-008): DEL the Redis keys of every open session
        before the user row goes; the rows go with it by CASCADE."""
        for row in await self.session_repo.list_open(user_id):
            await self.store.end(row.id)
