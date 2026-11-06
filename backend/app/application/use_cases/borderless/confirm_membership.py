"""Confirm the membership with the Borderless password (ADR-0024).

Renews the stored Borderless access and reads the membership for the
signed-in user. Keeps the current applika session: no session row, no
Redis session write, no cookie. Only the Borderless account already bound
to the caller is accepted.
"""

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.borderless_client import BorderlessClient
from app.application.use_cases.borderless.credentials import (
    SignInLimiter,
    check_credentials,
)
from app.application.use_cases.borderless.refresh_badges import (
    RefreshBadgesUseCase,
)
from app.application.use_cases.borderless.sign_in import encrypted_token
from app.core.exceptions import BindingConflict
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)

NOT_YOUR_ACCOUNT = (
    'This is not the Borderless account linked to your applika account'
)


class ConfirmMembershipUseCase:
    def __init__(
        self,
        session: AsyncSession,
        redis_client: redis.Redis,
        client: BorderlessClient,
    ):
        self.session = session
        self.client = client
        self.limiter = SignInLimiter(redis_client)
        self.bindings = BorderlessAccountRepository(session)

    async def execute(self, user_id: int, email: str, password: str) -> None:
        answer = await check_credentials(
            self.limiter, self.client, email, password
        )
        binding = await self.bindings.get_by_user_id(user_id)
        if binding is None or binding.borderless_user_id != answer.user_id:
            raise BindingConflict(NOT_YOUR_ACCOUNT)
        ciphertext, expires_at = encrypted_token(answer)
        await self.bindings.store_tokens(
            binding,
            email=answer.email,
            encrypted_access_token=ciphertext,
            access_token_expires_at=expires_at,
        )
        await RefreshBadgesUseCase(self.session, self.client).execute(user_id)
