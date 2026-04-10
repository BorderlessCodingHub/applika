"""GitHub API service with Redis-cached validation.

Provides methods to:
- Validate a GitHub access token (GET /user)
- Check organization membership (GET /user/orgs)

Both results are cached in Redis to avoid excessive GitHub API calls.
"""

import httpx
import redis.asyncio as redis

from app.config.logging import logger
from app.config.settings import envs


class GitHubService:
    _API_BASE = 'https://api.github.com'
    _HEADERS = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.cache_ttl = envs.GITHUB_CACHE_TTL_SECONDS
        self.org_name = envs.DISCORD_REPORTS_ORGANIZATION

    def _auth_headers(self, token: str) -> dict:
        return {**self._HEADERS, 'Authorization': f'Bearer {token}'}

    async def validate_token(
        self, user_id: int, github_token: str
    ) -> bool:
        """Check if a GitHub token is still valid. Cached per user."""
        cache_key = f'github:token_valid:{user_id}'

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
            logger.error(
                f'GitHub token validation failed: {exc}'
            )
            is_valid = False

        await self.redis.set(
            cache_key, '1' if is_valid else '0', ex=self.cache_ttl
        )
        return is_valid

    async def check_org_membership(
        self, user_id: int, github_token: str
    ) -> bool:
        """Check if user belongs to the configured org. Cached per user."""
        if not self.org_name:
            return False

        cache_key = f'github:org_member:{user_id}'

        cached = await self.redis.get(cache_key)
        if cached is not None:
            return cached == '1'

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self._API_BASE}/user/orgs',
                    headers=self._auth_headers(github_token),
                    timeout=10,
                )
                if response.status_code != 200:
                    logger.warning(
                        'GitHub /user/orgs returned '
                        f'status {response.status_code}'
                    )
                    is_member = False
                else:
                    orgs = response.json()
                    is_member = any(
                        org.get('login') == self.org_name
                        for org in orgs
                    )
        except httpx.HTTPError as exc:
            logger.error(
                f'GitHub org membership check failed: {exc}'
            )
            is_member = False

        await self.redis.set(
            cache_key, '1' if is_member else '0', ex=self.cache_ttl
        )
        return is_member

    async def invalidate_cache(self, user_id: int) -> None:
        """Remove all cached GitHub data for a user."""
        await self.redis.delete(
            f'github:token_valid:{user_id}',
            f'github:org_member:{user_id}',
        )
