"""One Borderless sign-in attempt (ADR-0026 §3): fresh random values,
stored ten minutes, the verifier and nonce never leave Redis, the record
is single use and answers only to the browser that started it."""

import hashlib
import json

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.application.use_cases.borderless.login_state import (
    LOGIN_PREFIX,
    BorderlessLoginStateUseCase,
)
from app.config.settings import envs
from app.core.exceptions import SessionServiceUnavailable


class TtlRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    async def set(self, key, value, ex=None):
        self.values[key] = value
        self.ttls[key] = ex

    async def getdel(self, key):
        self.ttls.pop(key, None)
        return self.values.pop(key, None)


def use_case() -> tuple[BorderlessLoginStateUseCase, TtlRedis]:
    redis = TtlRedis()
    return BorderlessLoginStateUseCase(redis), redis  # ty: ignore[invalid-argument-type]


async def test_an_attempt_draws_four_fresh_values_and_stores_their_proof():
    login_state, redis = use_case()

    attempt = await login_state.create('web')
    other = await login_state.create('web')

    values = {attempt.state, attempt.binding, attempt.verifier, attempt.nonce}
    assert len(values) == 4
    assert all(len(value) >= 43 for value in values)
    assert attempt.state != other.state
    key = f'{LOGIN_PREFIX}{attempt.state}'
    record = json.loads(redis.values[key])
    assert record == {
        'binding_sha256': hashlib.sha256(attempt.binding.encode()).hexdigest(),
        'verifier': attempt.verifier,
        'nonce': attempt.nonce,
        'flow': 'web',
        'cli_login_id': None,
    }
    # The browser binding itself is never stored, only its hash.
    assert attempt.binding not in redis.values[key]
    assert redis.ttls[key] == envs.BORDERLESS_LOGIN_TTL_SECONDS == 600
    assert attempt.verifier not in repr(attempt)


async def test_the_right_browser_consumes_it_once():
    login_state, _ = use_case()
    attempt = await login_state.create('cli', 'login-1')

    record = await login_state.consume(attempt.state, attempt.binding)

    assert record is not None
    assert (record.flow, record.cli_login_id) == ('cli', 'login-1')
    assert (record.verifier, record.nonce) == (attempt.verifier, attempt.nonce)
    # Single use: a replay finds nothing.
    assert await login_state.consume(attempt.state, attempt.binding) is None


async def test_another_browser_is_refused_and_spends_the_attempt():
    login_state, _ = use_case()
    attempt = await login_state.create('web')

    assert await login_state.consume(attempt.state, 'another-browser') is None
    assert await login_state.consume(attempt.state, attempt.binding) is None


async def test_no_state_no_cookie_or_an_unknown_state_is_refused():
    login_state, _ = use_case()
    attempt = await login_state.create('web')

    assert await login_state.consume(None, attempt.binding) is None
    assert await login_state.consume(attempt.state, None) is None
    assert await login_state.consume('unknown', attempt.binding) is None
    # Neither spent the attempt.
    assert await login_state.consume(attempt.state, attempt.binding)


async def test_a_corrupt_record_is_refused():
    login_state, redis = use_case()
    redis.values[f'{LOGIN_PREFIX}s'] = 'not json'
    assert await login_state.consume('s', 'b') is None
    redis.values[f'{LOGIN_PREFIX}s'] = json.dumps({
        'binding_sha256': hashlib.sha256(b'b').hexdigest(),
        'verifier': 'v',
        'nonce': 'n',
        'flow': 'other',
    })
    assert await login_state.consume('s', 'b') is None


async def test_redis_down_fails_closed_with_auth_1003():
    class DownRedis:
        async def set(self, *args, **kwargs):
            raise RedisConnectionError('down')

        async def getdel(self, *args):
            raise OSError('down')

    login_state = BorderlessLoginStateUseCase(DownRedis())  # ty: ignore[invalid-argument-type]
    with pytest.raises(SessionServiceUnavailable):
        await login_state.create('web')
    with pytest.raises(SessionServiceUnavailable) as excinfo:
        await login_state.consume('state', 'binding')
    assert excinfo.value.code == 'AUTH-1003'
