"""Give the Borderless grant back when the last session ends (ADR-0026
§10).

Called after a logout (``GET /auth/logout``, ``POST /auth/revoke``) or a
device revocation, and with ``force`` before an account deletion. While
another applika session of the user is still open, nothing happens and
Borderless is not told. Otherwise the binding forgets its refresh token
(one commit), the Redis access token goes, and the decrypted refresh token
is returned for the route to revoke at Borderless after answering
(``BackgroundTasks``, best effort). The Borderless browser session is never
touched.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.core.crypto import decrypt_borderless_token
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)


class ReleaseBorderlessGrantUseCase:
    def __init__(
        self,
        session: AsyncSession,
        session_repo: UserSessionRepository,
        access: BorderlessAccessStore,
    ):
        self.session = session
        self.bindings = BorderlessAccountRepository(session)
        self.session_repo = session_repo
        self.access = access

    async def _has_open_session(self, user_id: int) -> bool:
        now = datetime.now(UTC)
        return any(
            row.expires_at > now
            for row in await self.session_repo.list_open(user_id)
        )

    async def execute(self, user_id: int, *, force: bool = False) -> str | None:
        if not force and await self._has_open_session(user_id):
            return None
        binding = await self.bindings.get_by_user_id_for_update(user_id)
        if binding is None or binding.encrypted_refresh_token is None:
            await self.session.commit()  # release the row lock
            await self.access.drop(user_id)
            return None
        token = decrypt_borderless_token(binding.encrypted_refresh_token)
        await self.bindings.clear_refresh_token(binding)
        await self.access.drop(user_id)
        return token
