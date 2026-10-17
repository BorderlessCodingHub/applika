import json
import uuid

import redis.asyncio as redis


class AuthHandoffStateUseCase:
    """Keeps the short-lived auth bridge used by the CLI login flow.

    The browser can complete GitHub OAuth, but the installed CLI still needs a
    temporary server-side handoff before the backend issues the normal Applika
    session. This state is intentionally separate from the long-lived
    access/refresh token lifecycle.

    KODI-057 (ADR-0019): the same state carries the PKCE browser sign-in of
    ``applika-cli`` 1.1.0. A login or code with ``flow='pkce'`` also holds
    the ``code_challenge`` and the ``redirect_uri`` it is bound to; a code
    without ``flow`` is the legacy handoff. Codes stay one use (``GETDEL``)
    and live 60 s either way.
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
        flow: str | None = None,
        code_challenge: str | None = None,
    ) -> str:
        login_id = uuid.uuid4().hex
        data: dict[str, str] = {
            'callback_url': callback_url,
            'state': state,
        }
        if flow is not None:
            data['flow'] = flow
        if code_challenge is not None:
            data['code_challenge'] = code_challenge
        payload = json.dumps(data)
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
        flow: str | None = None,
        code_challenge: str | None = None,
        redirect_uri: str | None = None,
    ) -> str:
        code = uuid.uuid4().hex
        data: dict[str, str | int] = {
            'login_id': login_id,
            'user_id': user_id,
            'github_id': github_id,
        }
        if flow is not None:
            data['flow'] = flow
        if code_challenge is not None:
            data['code_challenge'] = code_challenge
        if redirect_uri is not None:
            data['redirect_uri'] = redirect_uri
        payload = json.dumps(data)
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
