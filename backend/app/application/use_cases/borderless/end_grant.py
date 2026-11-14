"""Borderless refused applika's grant (ADR-0026 §9).

``invalid_grant`` on a refresh (30 days after the sign-in, or access
revoked), a stored refresh token that no longer decrypts, or a binding with
no refresh token at all (a password-era binding): the binding forgets its
refresh token and becomes ``needs_reconnect``, every open **web** session
of the user ends ``borderless_revoked`` (the Devices list shows them
revoked), and the Redis access token goes. CLI sessions stay open: their
member-gated requests answer AUTH-1050 until the next sign-in.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.application.services.session_store import SessionStore
from app.application.use_cases.sessions.end_session import EndSessionUseCase
from app.config.logging import logger
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)


class EndBorderlessGrantUseCase:
    def __init__(
        self,
        session: AsyncSession,
        session_repo: UserSessionRepository,
        store: SessionStore,
        access: BorderlessAccessStore,
    ):
        self.bindings = BorderlessAccountRepository(session)
        self.session_repo = session_repo
        self.end_session = EndSessionUseCase(session_repo, store)
        self.access = access

    async def execute(self, user_id: int) -> int:
        """End the grant; answers how many web sessions ended."""
        binding = await self.bindings.get_by_user_id_for_update(user_id)
        if binding is not None:
            await self.bindings.clear_refresh_token(
                binding, needs_reconnect=True
            )
        ended = 0
        for row in await self.session_repo.list_open(user_id):
            if row.client_type == 'web' and await self.end_session.end_row(
                row, 'borderless_revoked'
            ):
                ended += 1
        await self.access.drop(user_id)
        logger.info(
            f'Borderless grant ended for user {user_id}: '
            f'{ended} web session(s) ended'
        )
        return ended
