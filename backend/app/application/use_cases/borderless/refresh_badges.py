"""Keep the membership current (ADR-0026 §8, §9).

Runs at every session refresh (``GET /auth/refresh`` and the CLI's
``refresh_token`` grant) and at every membership-gated request. The Redis
access token is the freshness marker: present → ``fresh``, no Borderless
call. Missing or expired (or Redis unreachable): take the binding's row
lock, check Redis again, and call the ``refresh_token`` grant. About once
an hour per active user, never more often than the access token lives.

Outcomes:

- ``fresh``: the access token is in Redis; nothing read.
- ``ok``: the rotated refresh token (encrypted), the claim's badges and
  ``profile_read_at`` committed together, then the new access token stored
  in Redis.
- ``failed``: Borderless slow, failing or rate-limiting, an answer that
  does not verify, or another ``sub``: ``profile_read_failed_at``, the
  badges stay as last read, no access token stored (the next check tries
  again; a request that waited on the row lock behind a refresh that
  failed less than ``FAILURE_BACKOFF_SECONDS`` ago answers ``failed``
  without a call). Never blocks or ends a session.
- ``ended``: ``invalid_grant``, a refresh token that no longer decrypts, or
  an ``active`` binding with no refresh token (password era):
  ``EndBorderlessGrantUseCase`` has run under the same row lock (web
  sessions ended, ``needs_reconnect``, access token gone).
- ``disconnected``: no binding, or ``needs_reconnect``: no call.

Never raises: anything unexpected is a WARNING and ``failed``.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.application.services.borderless_oidc import (
    BorderlessError,
    BorderlessGrant,
    BorderlessGrantEnded,
    BorderlessOidcClient,
)
from app.application.use_cases.borderless.end_grant import (
    EndBorderlessGrantUseCase,
)
from app.application.use_cases.borderless.membership import badge_for
from app.config.logging import logger
from app.core.crypto import decrypt_borderless_token, encrypt_borderless_token
from app.core.enums import BorderlessAccountStatus
from app.domain.models import BorderlessAccountModel
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_badge_repository import UserBadgeRepository

RefreshOutcome = Literal['fresh', 'ok', 'failed', 'ended', 'disconnected']

# Concurrent requests of one user queue on the binding's row lock; one that
# finds a refresh failed this recently answers ``failed`` without calling
# Borderless again (the next check after that tries again).
FAILURE_BACKOFF_SECONDS = 5


def _failed_just_now(binding: BorderlessAccountModel) -> bool:
    failed = binding.profile_read_failed_at
    if failed is None:
        return False
    if binding.profile_read_at is not None and binding.profile_read_at > failed:
        return False
    return datetime.now(UTC) - failed < timedelta(
        seconds=FAILURE_BACKOFF_SECONDS
    )


class RefreshBadgesUseCase:
    def __init__(
        self,
        session: AsyncSession,
        oidc: BorderlessOidcClient,
        access: BorderlessAccessStore,
        end_grant: EndBorderlessGrantUseCase,
    ):
        self.session = session
        self.oidc = oidc
        self.access = access
        self.end_grant = end_grant
        self.bindings = BorderlessAccountRepository(session)
        self.badges = UserBadgeRepository(session)

    async def execute(
        self, user_id: int, timeout: float | None = None
    ) -> RefreshOutcome:
        if await self.access.present(user_id):
            return 'fresh'
        try:
            return await self._refresh(user_id, timeout)
        except Exception as exc:  # never blocks a refresh or a request
            await self.session.rollback()
            logger.warning(
                f'Membership refresh failed for user {user_id} '
                f'({type(exc).__name__})'
            )
            return 'failed'

    async def _refresh(
        self, user_id: int, timeout: float | None
    ) -> RefreshOutcome:
        binding = await self.bindings.get_by_user_id_for_update(user_id)
        if binding is None:
            await self.session.commit()
            return 'disconnected'
        # Another request may have refreshed while this one waited for the
        # lock.
        if await self.access.present(user_id):
            await self.session.commit()
            return 'fresh'
        if binding.status == BorderlessAccountStatus.NEEDS_RECONNECT.value:
            await self.session.commit()
            return 'disconnected'
        if _failed_just_now(binding):
            # A request queued behind a refresh that just failed does not
            # wait for Borderless again.
            await self.session.commit()
            return 'failed'
        stored = binding.encrypted_refresh_token
        token = decrypt_borderless_token(stored) if stored else None
        if token is None:
            return await self._end(user_id)
        try:
            grant = await self.oidc.refresh(token, timeout)
        except BorderlessGrantEnded:
            return await self._end(user_id)
        except BorderlessError:
            await self.bindings.mark_read_failed(binding)
            return 'failed'
        if grant.identity.sub != binding.borderless_user_id:
            logger.warning(
                f'Membership refresh for user {user_id} answered another '
                'Borderless account'
            )
            await self.bindings.mark_read_failed(binding)
            return 'failed'
        return await self._apply(binding, grant)

    async def _end(self, user_id: int) -> RefreshOutcome:
        """The grant is refused: end it while this transaction still holds
        the binding's row lock, so a sign-in cannot slip in between."""
        await self.end_grant.execute(user_id)
        return 'ended'

    async def _apply(
        self, binding: BorderlessAccountModel, grant: BorderlessGrant
    ) -> RefreshOutcome:
        user_id = binding.user_id
        ciphertext = (
            encrypt_borderless_token(grant.refresh_token)
            if grant.refresh_token
            else binding.encrypted_refresh_token
        )
        if ciphertext is None:
            await self.bindings.mark_read_failed(binding)
            return 'failed'
        await self.bindings.store_refresh_token(
            binding, encrypted_refresh_token=ciphertext, commit=False
        )
        await self.badges.apply(
            user_id, badge_for(grant.identity.membership), commit=False
        )
        await self.session.commit()
        await self.access.put(user_id, grant.access_token, grant.expires_in)
        return 'ok'
