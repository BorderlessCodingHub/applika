from datetime import UTC, datetime

from app.application.dto.user_session import SessionTokensDTO
from app.application.services.session_store import SessionStore
from app.application.use_cases.borderless.refresh_badges import (
    RefreshBadgesUseCase,
)
from app.application.use_cases.sessions.end_session import EndSessionUseCase
from app.application.use_cases.sessions.open_session import (
    next_expiry,
    session_tokens,
)
from app.config.settings import envs
from app.core.exceptions import InvalidSession
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

NOT_AUTHENTICATED = 'Not authenticated'
INVALID_REFRESH = 'Invalid or expired refresh token'
USER_NOT_FOUND = 'User not found'
SIGN_IN_AGAIN = 'Sign in again with Borderless'


class RefreshSessionUseCase:
    """Serves ``GET /auth/refresh`` and the ``refresh_token`` grant.

    Resolve the refresh value; a user with no Borderless binding (an
    account from before ADR-0024) ends the session as ``expired`` and must
    sign in again. Otherwise read the membership (never fails the refresh,
    ADR-0024 §4), then slide both Redis keys and ``expires_at`` a full
    window ahead and copy the live last use onto the row. The refresh value
    is never rotated."""

    def __init__(
        self,
        user_repo: UserRepository,
        session_repo: UserSessionRepository,
        store: SessionStore,
        binding_repo: BorderlessAccountRepository,
        refresh_badges: RefreshBadgesUseCase,
    ):
        self.user_repo = user_repo
        self.session_repo = session_repo
        self.store = store
        self.binding_repo = binding_repo
        self.refresh_badges = refresh_badges
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

        # A session opened before ADR-0024 never slides on, even once its
        # user has bound a Borderless account elsewhere.
        if (
            await self.store.is_legacy(session_id)
            or await self.binding_repo.get_by_user_id(user_id) is None
        ):
            await self.end_session.end_row(row, 'expired')
            raise InvalidSession(SIGN_IN_AGAIN)

        await self.refresh_badges.execute(
            user_id, envs.BORDERLESS_REFRESH_TIMEOUT_SECONDS
        )

        expires_at = next_expiry(datetime.now(UTC))
        if not await self.store.slide(session_id, refresh_value, expires_at):
            raise InvalidSession(INVALID_REFRESH)

        live = await self.store.live(session_id)
        await self.session_repo.set_expiry(
            session_id, expires_at, live.last_used_at, live.last_ip
        )
        return session_tokens(session_id, user_id, refresh_value)
