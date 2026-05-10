import json
import uuid

import redis.asyncio as redis


class AuthHandoffStateUseCase:
    """Keeps the short-lived auth bridge used by the CLI login flow.

    The browser can complete GitHub OAuth, but the installed CLI still needs a
    temporary server-side handoff before the backend issues the normal Applika
    session. This state is intentionally separate from the long-lived
    access/refresh token lifecycle.
    """

    _login_ttl_seconds = 300
    _code_ttl_seconds = 60
    _login_prefix = 'applika:auth_handoff:login:'
    _code_prefix = 'applika:auth_handoff:code:'

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.login_ttl_seconds = self._login_ttl_seconds
        self.code_ttl_seconds = self._code_ttl_seconds

    def _login_key(self, login_id: str) -> str:
        return f'{self._login_prefix}{login_id}'

    def _code_key(self, code: str) -> str:
        return f'{self._code_prefix}{code}'

    async def create_login(
        self,
        callback_url: str,
        state: str,
    ) -> str:
        login_id = uuid.uuid4().hex
        payload = json.dumps({
            'callback_url': callback_url,
            'state': state,
        })
        await self.redis.set(
            self._login_key(login_id),
            payload,
            ex=self.login_ttl_seconds,
        )
        return login_id

    async def get_login(self, login_id: str) -> dict | None:
        payload = await self.redis.get(self._login_key(login_id))
        if payload is None:
            return None
        data = json.loads(payload)
        return {
            'login_id': login_id,
            **data,
        }

    async def delete_login(self, login_id: str) -> None:
        await self.redis.delete(self._login_key(login_id))

    async def create_exchange_code(
        self,
        login_id: str,
        user_id: int,
        github_id: int,
    ) -> str:
        code = uuid.uuid4().hex
        payload = json.dumps({
            'login_id': login_id,
            'user_id': user_id,
            'github_id': github_id,
        })
        await self.redis.set(
            self._code_key(code),
            payload,
            ex=self.code_ttl_seconds,
        )
        return code

    async def pop_exchange_code(self, code: str) -> dict | None:
        payload = await self.redis.getdel(self._code_key(code))
        if payload is None:
            return None
        return json.loads(payload)
