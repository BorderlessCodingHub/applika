from datetime import UTC, datetime

from app.application.dto.user_session import SessionTokensDTO
from app.application.services.github_service import GitHubService
from app.application.services.session_store import SessionStore
from app.application.use_cases.sessions.end_session import EndSessionUseCase
from app.application.use_cases.sessions.open_session import (
    next_expiry,
    session_tokens,
)
from app.core.crypto import decrypt_token
from app.core.exceptions import InvalidSession
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

NOT_AUTHENTICATED = 'Not authenticated'
INVALID_REFRESH = 'Invalid or expired refresh token'
USER_NOT_FOUND = 'User not found'
GITHUB_REVOKED = 'GitHub token revoked'


class RefreshSessionUseCase:
    """Serves ``GET /auth/refresh`` and the ``refresh_token`` grant.

    Resolve the refresh value, re-check the GitHub token as before KODI-057
    (revoked -> the session ends as ``github_revoked``), then slide both
    Redis keys and ``expires_at`` a full window ahead and copy the live last
    use onto the row. The refresh value is never rotated."""

    def __init__(
        self,
        user_repo: UserRepository,
        session_repo: UserSessionRepository,
        store: SessionStore,
        gh_service: GitHubService,
    ):
        self.user_repo = user_repo
        self.session_repo = session_repo
        self.store = store
        self.gh_service = gh_service
        self.end_session = EndSessionUseCase(session_repo, store)

    async def execute(self, refresh_value: str | None) -> SessionTokensDTO:
        if not refresh_value:
            raise InvalidSession(NOT_AUTHENTICATED)

        session_id = await self.store.resolve_refresh(refresh_value)
        if session_id is None:
            raise InvalidSession(INVALID_REFRESH)

        row = await self.session_repo.get(session_id)
        if row is None or row.ended_at is not None:
            await self.store.end(session_id)
            raise InvalidSession(INVALID_REFRESH)

        user = await self.user_repo.get_by_id(row.user_id)
        if user is None:
            await self.store.end(session_id)
            raise InvalidSession(USER_NOT_FOUND)
        user_id = user.id
        github_id = user.github_id

        if user.encrypted_github_token:
            github_token = decrypt_token(user.encrypted_github_token)
            if github_token:
                is_valid = await self.gh_service.validate_token(
                    user_id, github_token
                )
                if not is_valid:
                    await self.end_session.end_row(row, 'github_revoked')
                    raise InvalidSession(GITHUB_REVOKED)

        expires_at = next_expiry(datetime.now(UTC))
        if not await self.store.slide(session_id, refresh_value, expires_at):
            raise InvalidSession(INVALID_REFRESH)

        live = await self.store.live(session_id)
        await self.session_repo.set_expiry(
            session_id, expires_at, live.last_used_at, live.last_ip
        )
        return session_tokens(session_id, github_id, refresh_value)
