"""Unit tests for the pure rate-limit core (KODI-039, T028)."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, cast

import jwt
import pytest
from redis.exceptions import RedisError

from app.config.settings import ACCESS_COOKIE_NAME, Settings, envs
from app.core.rate_limit import Decision, bucket_for, hit, subject_for
from app.core.tokens import create_access_token

if TYPE_CHECKING:
    import redis.asyncio as redis


def test_settings_rate_limit_defaults():
    """AC2/AC5: the shipped defaults are 120/min default, 10/min /auth/*,
    a 60s window, and the limiter on - pinned so a default cannot silently
    drift (a fresh Settings(), not the process-wide `envs` other fixtures
    mutate)."""
    settings = Settings()  # ty: ignore[missing-argument]
    assert settings.RATE_LIMIT_ENABLED is True
    assert settings.RATE_LIMIT_DEFAULT == 120
    assert settings.RATE_LIMIT_AUTH == 10
    assert settings.RATE_LIMIT_WINDOW_SECONDS == 60


def test_settings_rate_limit_env_var_names(monkeypatch):
    """AC5: the owner changes these with a restart, through these exact
    environment variable names."""
    monkeypatch.setenv('RATE_LIMIT_ENABLED', 'false')
    monkeypatch.setenv('RATE_LIMIT_DEFAULT', '7')
    monkeypatch.setenv('RATE_LIMIT_AUTH', '3')
    monkeypatch.setenv('RATE_LIMIT_WINDOW_SECONDS', '15')

    settings = Settings()  # ty: ignore[missing-argument]

    assert settings.RATE_LIMIT_ENABLED is False
    assert settings.RATE_LIMIT_DEFAULT == 7
    assert settings.RATE_LIMIT_AUTH == 3
    assert settings.RATE_LIMIT_WINDOW_SECONDS == 15


def test_bucket_for_auth_prefix():
    assert bucket_for('/auth/refresh') == 'auth'
    assert bucket_for('/auth/login') == 'auth'


def test_bucket_for_default_bucket():
    assert bucket_for('/authors') == 'default'
    assert bucket_for('/applications') == 'default'


def test_subject_for_valid_access_token():
    token, _, _ = create_access_token('42')
    subject = subject_for({ACCESS_COOKIE_NAME: token}, '10.0.0.1')
    assert subject == 'user:42'


def test_subject_for_expired_token_falls_back_to_ip():
    payload = {
        'sub': '42',
        'kind': 'access',
        'exp': datetime.now(UTC) - timedelta(minutes=1),
    }
    token = jwt.encode(payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM)
    subject = subject_for({ACCESS_COOKIE_NAME: token}, '10.0.0.1')
    assert subject == 'ip:10.0.0.1'


def test_subject_for_bad_signature_falls_back_to_ip():
    payload = {
        'sub': '42',
        'kind': 'access',
        'exp': datetime.now(UTC) + timedelta(minutes=5),
    }
    token = jwt.encode(payload, 'wrong-secret', algorithm=envs.JWT_ALGORITHM)
    subject = subject_for({ACCESS_COOKIE_NAME: token}, '10.0.0.1')
    assert subject == 'ip:10.0.0.1'


def test_subject_for_wrong_kind_falls_back_to_ip():
    payload = {
        'sub': '42',
        'kind': 'refresh',
        'exp': datetime.now(UTC) + timedelta(minutes=5),
    }
    token = jwt.encode(payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM)
    subject = subject_for({ACCESS_COOKIE_NAME: token}, '10.0.0.1')
    assert subject == 'ip:10.0.0.1'


def test_subject_for_absent_cookie_falls_back_to_ip():
    assert subject_for({}, '10.0.0.1') == 'ip:10.0.0.1'


def test_subject_for_garbage_token_falls_back_to_ip():
    subject = subject_for({ACCESS_COOKIE_NAME: 'not-a-jwt'}, '10.0.0.1')
    assert subject == 'ip:10.0.0.1'


def test_subject_for_no_client_host():
    assert subject_for({}, None) == 'ip:unknown'


class _StubPipeline:
    def __init__(self, redis_stub: '_StubRedis'):
        self._redis = redis_stub
        self._ops: list[tuple] = []

    def incr(self, key):
        self._ops.append(('incr', key))
        return self

    def expireat(self, key, when):
        self._ops.append(('expireat', key, when))
        return self

    async def execute(self):
        incr_key = self._ops[0][1]
        self._redis.counts[incr_key] = self._redis.counts.get(incr_key, 0) + 1
        expireat_call = self._ops[1]
        self._redis.expireat_calls.append(expireat_call)
        return [self._redis.counts[incr_key], True]


class _StubRedis:
    def __init__(self):
        self.counts: dict[str, int] = {}
        self.expireat_calls: list[tuple] = []

    def pipeline(self):
        return _StubPipeline(self)


class _RaisingPipeline:
    def incr(self, key):
        return self

    def expireat(self, key, when):
        return self

    async def execute(self):
        raise RedisError('boom')


class _RaisingRedis:
    def pipeline(self):
        return _RaisingPipeline()


class _SlowPipeline:
    def incr(self, key):
        return self

    def expireat(self, key, when):
        return self

    async def execute(self):
        await asyncio.sleep(2)
        return [1, True]


class _SlowRedis:
    def pipeline(self):
        return _SlowPipeline()


def _fake_redis(stub: object) -> 'redis.Redis':
    """The stubs above only implement the ``pipeline()`` shape ``hit()``
    uses; cast lets the tests assert against that narrow surface without
    reproducing the whole ``redis.Redis`` interface."""
    return cast('redis.Redis', stub)


@pytest.mark.asyncio
async def test_hit_allows_up_to_limit_and_refuses_after():
    redis_stub = _StubRedis()
    limit = 3
    window = 60
    now = 1_000_000.0
    window_index = int(now // window)
    key = f'applika:ratelimit:default:ip:1.2.3.4:{window_index}'

    decisions: list[Decision] = []
    for _ in range(limit + 1):
        decision = await hit(
            _fake_redis(redis_stub), 'default', 'ip:1.2.3.4', limit, window, now
        )
        assert decision is not None
        decisions.append(decision)

    assert [d.allowed for d in decisions] == [True, True, True, False]
    assert [d.remaining for d in decisions] == [2, 1, 0, 0]
    assert redis_stub.counts[key] == limit + 1


@pytest.mark.asyncio
async def test_hit_key_shape_and_expireat_value():
    redis_stub = _StubRedis()
    window = 60
    now = 125.0  # window_index = 2, window_end = 180
    decision = await hit(
        _fake_redis(redis_stub), 'auth', 'ip:1.2.3.4', 10, window, now
    )

    assert decision is not None
    expected_key = 'applika:ratelimit:auth:ip:1.2.3.4:2'
    assert redis_stub.counts[expected_key] == 1
    assert redis_stub.expireat_calls[0] == (
        'expireat',
        expected_key,
        181,
    )
    assert decision.reset_after == 55


@pytest.mark.asyncio
async def test_hit_refused_request_never_moves_window_end():
    redis_stub = _StubRedis()
    window = 60
    now = 10.0
    for _ in range(3):
        await hit(
            _fake_redis(redis_stub), 'default', 'ip:1.2.3.4', 1, window, now
        )

    # window_index is fixed by `now`'s window, so every EXPIREAT in this
    # window (allowed or refused) computes the same window end.
    ends = {call[2] for call in redis_stub.expireat_calls}
    assert ends == {61}


@pytest.mark.asyncio
async def test_hit_redis_error_fails_open_with_warning(caplog):
    caplog.set_level(logging.WARNING, logger='app')
    decision = await hit(
        _fake_redis(_RaisingRedis()), 'default', 'user:42', 120, 60, 1000.0
    )
    assert decision is None
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert 'user:42' not in warnings[0].getMessage()
    assert 'default' in warnings[0].getMessage() or 'default' in str(
        getattr(warnings[0], 'extra_data', '')
    )


@pytest.mark.asyncio
async def test_hit_slow_redis_times_out_fails_open(caplog, monkeypatch):
    caplog.set_level(logging.WARNING, logger='app')
    import app.core.rate_limit as rate_limit_module

    monkeypatch.setattr(rate_limit_module, '_HIT_TIMEOUT_SECONDS', 0.05)
    decision = await hit(
        _fake_redis(_SlowRedis()), 'auth', 'user:7', 10, 60, 1000.0
    )
    assert decision is None
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert 'user:7' not in warnings[0].getMessage()
