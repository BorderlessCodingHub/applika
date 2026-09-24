import secrets

import redis.asyncio as redis

from app.config.settings import envs


class AccountLinkStateUseCase:
    """The short-lived CSRF nonce for the Discord account-link flow (T015).

    Separate from ``AuthHandoffStateUseCase``: this state never carries a
    session, only which Applika user started the link, so the callback can
    refuse a consent result that comes back for someone else (R-008).
    """

    _prefix = 'applika:account_link:discord:'

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.ttl_seconds = envs.ACCOUNT_LINK_STATE_TTL_SECONDS

    def _key(self, nonce: str) -> str:
        return f'{self._prefix}{nonce}'

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
