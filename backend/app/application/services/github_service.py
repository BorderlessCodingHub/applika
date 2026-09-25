"""GitHub API service with Redis-cached validation.

Provides a method to validate a GitHub access token (GET /user), cached in
Redis to avoid excessive GitHub API calls. Organisation membership is
retired (K8, R-042/R-043): the service no longer checks it and no longer
reads a configured org name.
"""

import httpx
import redis.asyncio as redis

from app.config.logging import logger
from app.config.settings import envs


class GitHubService:
    _API_BASE = 'https://api.github.com'
    _HEADERS = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
    }

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.cache_ttl = envs.GITHUB_CACHE_TTL_SECONDS

    def _auth_headers(self, token: str) -> dict:
        return {**self._HEADERS, 'Authorization': f'Bearer {token}'}

    async def validate_token(self, user_id: int, github_token: str) -> bool:
        """Check if a GitHub token is still valid. Cached per user."""
        cache_key = f'applika:github:token_valid:{user_id}'

        cached = await self.redis.get(cache_key)
        if cached is not None:
            return cached == '1'

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self._API_BASE}/user',
                    headers=self._auth_headers(github_token),
                    timeout=10,
                )
                is_valid = response.status_code == 200
        except httpx.HTTPError as exc:
            logger.error(f'GitHub token validation failed: {exc}')
            is_valid = False

        if user_id:
            await self.redis.set(
                cache_key, '1' if is_valid else '0', ex=self.cache_ttl
            )
        return is_valid

    async def invalidate_cache(self, user_id: int) -> None:
        """Remove all cached GitHub data for a user."""
        await self.redis.delete(
            f'applika:github:token_valid:{user_id}',
        )
