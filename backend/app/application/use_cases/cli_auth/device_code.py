"""RFC 8628 device authorization for ``applika login --device`` (R-016,
R-017).

Redis on ``REDIS_URL``, both keys ``EX DEVICE_CODE_TTL_SECONDS``:

- ``applika:device:code:<device_code>`` hash ``{user_code, status
  (pending|approved|denied), user_id, device_name, ip,
  user_agent, requested_at, last_poll_at}``;
- ``applika:device:user_code:<CODE>`` -> the device code.

Approve and deny are one Lua script each way, so a code is decided once.
The poll is one script too: it answers ``slow_down`` when polled faster
than the interval, and consumes an approved or denied code (one use).
"""

import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import redis.asyncio as redis

from app.application.dto.user_session import DeviceCodeDTO, DeviceRequestDTO
from app.application.services.session_store import redis_guard
from app.application.use_cases.sessions.open_session import (
    IP_MAX,
    USER_AGENT_MAX,
    device_name_for,
)
from app.config.settings import envs
from app.core.exceptions import (
    OAuthError,
    ResourceConflict,
    ResourceNotFound,
    ServiceUnavailable,
)
from app.core.user_agent import describe_user_agent
from app.core.user_codes import (
    format_user_code,
    generate_user_code,
    normalize_user_code,
)

CODE_PREFIX = 'applika:device:code:'
USER_CODE_PREFIX = 'applika:device:user_code:'

CODE_NOT_FOUND = 'Code not found or expired'
CODE_ALREADY_USED = 'Code already used'

_USER_CODE_ATTEMPTS = 5

# 0 = unknown or expired, 1 = already decided, 2 = decided now.
_DECIDE_LUA = """
local device_code = redis.call('GET', KEYS[1])
if not device_code then
  return 0
end
local code_key = ARGV[1] .. device_code
if redis.call('EXISTS', code_key) == 0 then
  return 0
end
if redis.call('HGET', code_key, 'status') ~= 'pending' then
  return 1
end
redis.call('HSET', code_key, 'status', ARGV[2], 'user_id', ARGV[3])
return 2
"""

_POLL_LUA = """
local code_key = KEYS[1]
if redis.call('EXISTS', code_key) == 0 then
  return {'expired'}
end
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local last = redis.call('HGET', code_key, 'last_poll_at')
redis.call('HSET', code_key, 'last_poll_at', ARGV[1])
if last and last ~= '' and (now - tonumber(last)) < interval then
  return {'slow_down'}
end
local status = redis.call('HGET', code_key, 'status')
if status == 'pending' then
  return {'pending'}
end
if status ~= 'approved' and status ~= 'denied' then
  return {'expired'}
end
local fields = redis.call(
  'HMGET', code_key, 'user_id', 'device_name', 'user_agent', 'ip'
)
local user_code = redis.call('HGET', code_key, 'user_code')
redis.call('DEL', code_key)
if user_code then
  redis.call('DEL', ARGV[3] .. user_code)
end
if status == 'denied' then
  return {'denied'}
end
return {
  'approved', fields[1] or '', fields[2] or '', fields[3] or '',
  fields[4] or ''
}
"""


def _text(value: object) -> str:
    """A Redis reply as text (the client decodes responses; bytes only
    if it ever did not)."""
    if value is None:
        return ''
    if isinstance(value, bytes):
        return value.decode()
    return str(value)


def code_key(device_code: str) -> str:
    return f'{CODE_PREFIX}{device_code}'


def user_code_key(user_code: str) -> str:
    return f'{USER_CODE_PREFIX}{user_code}'


@dataclass(frozen=True)
class ApprovedDevice:
    """An approved device code, consumed: who approved it and what asked."""

    user_id: int
    device_name: str
    user_agent: str | None
    ip: str | None


class DeviceCodeUseCase:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self._decide_script = redis_client.register_script(_DECIDE_LUA)
        self._poll_script = redis_client.register_script(_POLL_LUA)

    async def start(
        self,
        device_name: str | None,
        user_agent: str | None,
        ip: str | None,
    ) -> DeviceCodeDTO:
        ttl = envs.DEVICE_CODE_TTL_SECONDS
        device_code = secrets.token_urlsafe(32)
        async with redis_guard('device_start'):
            user_code = None
            for _ in range(_USER_CODE_ATTEMPTS):
                candidate = generate_user_code()
                if await self.redis.set(
                    user_code_key(candidate), device_code, nx=True, ex=ttl
                ):
                    user_code = candidate
                    break
            if user_code is None:
                raise ServiceUnavailable('Could not allocate a device code')

            pipe = self.redis.pipeline(transaction=True)
            pipe.hset(
                code_key(device_code),
                mapping={
                    'user_code': user_code,
                    'status': 'pending',
                    'user_id': '',
                    'device_name': device_name_for(device_name, user_agent),
                    'ip': (ip or '')[:IP_MAX],
                    'user_agent': (user_agent or '')[:USER_AGENT_MAX],
                    'requested_at': datetime.now(UTC).isoformat(),
                    'last_poll_at': '',
                },
            )
            pipe.expire(code_key(device_code), ttl)
            await pipe.execute()

        shown = format_user_code(user_code)
        return DeviceCodeDTO(
            device_code=device_code,
            user_code=shown,
            verification_uri=envs.DEVICE_VERIFICATION_URI,
            verification_uri_complete=(
                f'{envs.DEVICE_VERIFICATION_URI}?code={shown}'
            ),
            expires_in=ttl,
            interval=envs.DEVICE_CODE_POLL_INTERVAL_SECONDS,
        )

    async def verify(self, raw_user_code: str) -> DeviceRequestDTO:
        """What the approval page shows: the requesting device's name, IP
        and request time (R-017). A code that is unknown, expired or already
        decided is 404."""
        user_code = normalize_user_code(raw_user_code)
        if user_code is None:
            raise ResourceNotFound(CODE_NOT_FOUND)
        async with redis_guard('device_verify'):
            device_code = _text(await self.redis.get(user_code_key(user_code)))
            raw = (
                await self.redis.hgetall(code_key(device_code))
                if device_code
                else {}
            )
        data = {_text(key): _text(value) for key, value in raw.items()}
        if data.get('status') != 'pending':
            raise ResourceNotFound(CODE_NOT_FOUND)

        requested_at = datetime.fromisoformat(data['requested_at'])
        user_agent = data.get('user_agent') or None
        return DeviceRequestDTO(
            device_name=data.get('device_name', ''),
            client_label=describe_user_agent(user_agent),
            ip=data.get('ip') or None,
            requested_at=requested_at,
            expires_at=requested_at
            + timedelta(seconds=envs.DEVICE_CODE_TTL_SECONDS),
        )

    async def approve(self, raw_user_code: str, user_id: int) -> None:
        await self._decide(raw_user_code, 'approved', user_id)

    async def deny(self, raw_user_code: str, user_id: int) -> None:
        await self._decide(raw_user_code, 'denied', user_id)

    async def _decide(
        self, raw_user_code: str, status: str, user_id: int
    ) -> None:
        user_code = normalize_user_code(raw_user_code)
        if user_code is None:
            raise ResourceNotFound(CODE_NOT_FOUND)
        async with redis_guard('device_decide'):
            outcome = await self._decide_script(
                keys=[user_code_key(user_code)],
                args=[CODE_PREFIX, status, str(user_id)],
            )
        if outcome == 0:
            raise ResourceNotFound(CODE_NOT_FOUND)
        if outcome == 1:
            raise ResourceConflict(CODE_ALREADY_USED)

    async def poll(self, device_code: str) -> ApprovedDevice:
        """One poll of the token endpoint. Raises the RFC 8628 error for
        every answer but an approval, which it consumes."""
        async with redis_guard('device_poll'):
            result = await self._poll_script(
                keys=[code_key(device_code)],
                args=[
                    repr(time.time()),
                    str(envs.DEVICE_CODE_POLL_INTERVAL_SECONDS),
                    USER_CODE_PREFIX,
                ],
            )
        result = [_text(item) for item in result]
        outcome = result[0]
        if outcome == 'expired':
            raise OAuthError('expired_token', 'Device code expired')
        if outcome == 'slow_down':
            raise OAuthError('slow_down', 'Polling too fast')
        if outcome == 'pending':
            raise OAuthError(
                'authorization_pending', 'Waiting for the user to approve'
            )
        if outcome == 'denied':
            raise OAuthError('access_denied', 'The sign-in was denied')

        _, user_id, device_name, user_agent, ip = result
        return ApprovedDevice(
            user_id=int(user_id),
            device_name=device_name,
            user_agent=user_agent or None,
            ip=ip or None,
        )
