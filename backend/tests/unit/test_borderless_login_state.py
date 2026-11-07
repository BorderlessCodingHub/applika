"""One Borderless sign-in attempt (ADR-0026 §3): a fresh version-4 UUID
state and fresh random values, stored ten minutes with the target the
sign-in ends on; the verifier, the nonce and the target never leave Redis,
the record is single use and answers only to the browser that started
it."""

import hashlib
import json
import uuid

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.application.use_cases.borderless.login_state import (
    LOGIN_PREFIX,
    BorderlessLoginStateUseCase,
)
from app.config.settings import envs
from app.core.exceptions import SessionServiceUnavailable


WEB = 'http://127.0.0.1:8080/login'
LOOPBACK = 'http://127.0.0.1:43129/callback'


class TtlRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}
        self.reads: list[str] = []

    async def set(self, key, value, ex=None):
        self.values[key] = value
        self.ttls[key] = ex

    async def getdel(self, key):
        self.reads.append(key)
        self.ttls.pop(key, None)
        return self.values.pop(key, None)


def use_case() -> tuple[BorderlessLoginStateUseCase, TtlRedis]:
    redis = TtlRedis()
    return BorderlessLoginStateUseCase(redis), redis  # ty: ignore[invalid-argument-type]


async def test_an_attempt_draws_four_fresh_values_and_stores_their_proof():
    login_state, redis = use_case()

    attempt = await login_state.create('web', target=WEB)
    other = await login_state.create('web', target=WEB)

    values = {attempt.state, attempt.binding, attempt.verifier, attempt.nonce}
    assert len(values) == 4
    # The state is a random version-4 UUID, fresh per attempt.
    assert str(uuid.UUID(attempt.state)) == attempt.state
    assert uuid.UUID(attempt.state).version == 4
    assert attempt.state != other.state
    # The binding, the PKCE verifier (43 to 128 chars) and the nonce stay
    # ``token_urlsafe(32)``.
    secrets_ = (attempt.binding, attempt.verifier, attempt.nonce)
    assert all(len(value) == 43 for value in secrets_)
    assert attempt.binding != other.binding
    key = f'{LOGIN_PREFIX}{attempt.state}'
    record = json.loads(redis.values[key])
    assert record == {
        'binding_sha256': hashlib.sha256(attempt.binding.encode()).hexdigest(),
        'verifier': attempt.verifier,
        'nonce': attempt.nonce,
        'flow': 'web',
        'cli_login_id': None,
        'target': WEB,
    }
    # The browser binding itself is never stored, only its hash.
    assert attempt.binding not in redis.values[key]
    assert redis.ttls[key] == envs.BORDERLESS_LOGIN_TTL_SECONDS == 600
    assert attempt.verifier not in repr(attempt)
    assert attempt.state not in repr(attempt)


async def test_the_right_browser_consumes_it_once():
    login_state, _ = use_case()
    attempt = await login_state.create('cli', 'login-1', target=LOOPBACK)

    record = await login_state.consume(attempt.state, attempt.binding)

    assert record is not None
    assert (record.flow, record.cli_login_id) == ('cli', 'login-1')
    assert record.target == LOOPBACK
    assert (record.verifier, record.nonce) == (attempt.verifier, attempt.nonce)
    # Single use: a replay finds nothing.
    assert await login_state.consume(attempt.state, attempt.binding) is None


async def test_another_browser_is_refused_and_spends_the_attempt():
    login_state, _ = use_case()
    attempt = await login_state.create('web', target=WEB)

    assert await login_state.consume(attempt.state, 'another-browser') is None
    assert await login_state.consume(attempt.state, attempt.binding) is None


async def test_no_state_no_cookie_or_an_unknown_state_is_refused():
    login_state, _ = use_case()
    attempt = await login_state.create('web', target=WEB)

    assert await login_state.consume(None, attempt.binding) is None
    assert await login_state.consume(attempt.state, None) is None
    assert await login_state.consume(str(uuid.uuid4()), attempt.binding) is None
    # Neither spent the attempt.
    assert await login_state.consume(attempt.state, attempt.binding)


@pytest.mark.parametrize(
    'state',
    [
        'unknown',
        'a' * 43,
        '*',
        'applika:session:x',
        # A UUID, but not in the form ``create`` draws it.
        '{12345678-1234-4234-8234-123456789abc}',
        '12345678123442348234123456789ABC',
    ],
)
async def test_a_state_that_is_not_a_drawn_uuid_never_reaches_redis(state):
    login_state, redis = use_case()

    assert await login_state.consume(state, 'binding') is None
    assert redis.reads == []


def _record(**changes) -> str:
    record = {
        'binding_sha256': hashlib.sha256(b'b').hexdigest(),
        'verifier': 'v',
        'nonce': 'n',
        'flow': 'web',
        'cli_login_id': None,
        'target': WEB,
        **changes,
    }
    return json.dumps({k: v for k, v in record.items() if v is not ...})


async def test_a_corrupt_record_is_refused():
    login_state, redis = use_case()
    state = str(uuid.uuid4())
    key = f'{LOGIN_PREFIX}{state}'
    redis.values[key] = 'not json'
    assert await login_state.consume(state, 'b') is None
    redis.values[key] = _record(flow='other')
    assert await login_state.consume(state, 'b') is None
    # A record from before the target was stored, or a target that is not
    # a string, is refused too.
    redis.values[key] = _record(target=...)
    assert await login_state.consume(state, 'b') is None
    redis.values[key] = _record(target=['https://evil.example.test'])
    assert await login_state.consume(state, 'b') is None
    redis.values[key] = _record()
    record = await login_state.consume(state, 'b')
    assert record is not None and record.target == WEB


async def test_redis_down_fails_closed_with_auth_1003():
    class DownRedis:
        async def set(self, *args, **kwargs):
            raise RedisConnectionError('down')

        async def getdel(self, *args):
            raise OSError('down')

    login_state = BorderlessLoginStateUseCase(DownRedis())  # ty: ignore[invalid-argument-type]
    with pytest.raises(SessionServiceUnavailable):
        await login_state.create('web', target=WEB)
    with pytest.raises(SessionServiceUnavailable) as excinfo:
        await login_state.consume(str(uuid.uuid4()), 'binding')
    assert excinfo.value.code == 'AUTH-1003'
