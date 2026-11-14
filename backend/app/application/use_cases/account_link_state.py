import secrets

import redis.asyncio as redis

from app.config.settings import envs

GITHUB_RESTORE = 'github_restore'


class AccountLinkStateUseCase:
    """The short-lived CSRF nonce of a one-shot account flow (ADR-0024: the
    GitHub restore).

    Separate from ``AuthHandoffStateUseCase``: this state never carries a
    session, only which applika user started the flow, so the callback can
    refuse a consent result that comes back for someone else.
    """

    def __init__(
        self, redis_client: redis.Redis, provider: str = GITHUB_RESTORE
    ):
        self.redis = redis_client
        self.provider = provider
        self.ttl_seconds = envs.ACCOUNT_LINK_STATE_TTL_SECONDS

    def _key(self, nonce: str) -> str:
        return f'applika:account_link:{self.provider}:{nonce}'

    async def create(self, user_id: int) -> str:
        nonce = secrets.token_urlsafe(32)
        await self.redis.set(
            self._key(nonce), str(user_id), ex=self.ttl_seconds
        )
        return nonce

    async def consume(self, nonce: str) -> int | None:
        """Single use: ``GETDEL`` so a replay of the same nonce never
        matches again."""
        value = await self.redis.getdel(self._key(nonce))
        if value is None:
            return None
        return int(value)
