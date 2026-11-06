"""Read the Borderless membership and apply it to the badges (ADR-0024).

Runs at every sign-in, confirmation and session refresh. Never raises:
a failing read keeps the recorded badges. Only a 200 that answers another
membership (or none) revokes.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.borderless_client import (
    BorderlessAccessRefused,
    BorderlessClient,
    BorderlessError,
)
from app.config.logging import logger
from app.core.crypto import decrypt_borderless_token
from app.core.enums import BorderlessAccountStatus
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_badge_repository import UserBadgeRepository


class RefreshBadgesUseCase:
    def __init__(self, session: AsyncSession, client: BorderlessClient):
        self.session = session
        self.client = client
        self.bindings = BorderlessAccountRepository(session)
        self.badges = UserBadgeRepository(session)

    async def execute(self, user_id: int, timeout: float | None = None) -> None:
        try:
            await self._execute(user_id, timeout)
        except Exception as exc:  # never blocks a sign-in or a refresh
            await self.session.rollback()
            logger.warning(
                f'Badge refresh failed for user {user_id} '
                f'({type(exc).__name__})'
            )

    async def _execute(self, user_id: int, timeout: float | None) -> None:
        binding = await self.bindings.get_by_user_id_for_update(user_id)
        if binding is None:
            await self.session.commit()
            return
        if (
            binding.status == BorderlessAccountStatus.NEEDS_RECONNECT.value
            or binding.access_token_expires_at <= datetime.now(UTC)
        ):
            await self.session.commit()  # release the row lock
            return
        token = decrypt_borderless_token(binding.encrypted_access_token)
        if token is None:
            await self.bindings.mark_needs_reconnect(binding)
            return
        try:
            badge = await self.client.read_membership(token, timeout=timeout)
        except BorderlessAccessRefused:
            await self.bindings.mark_needs_reconnect(binding)
            return
        except BorderlessError:
            await self.bindings.mark_read_failed(binding)
            return
        await self.badges.apply(user_id, badge, commit=False)
        await self.bindings.mark_read_ok(binding)
