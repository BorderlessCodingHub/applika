"""``BorderlessAccessStore`` (ADR-0026 §6, §8): the access token lives in
Redis only, encrypted, for exactly its own lifetime; Redis failing reads as
"missing" and never raises."""

import asyncio

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.application.services import borderless_access_store
from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
    access_key,
)
from app.config.settings import envs
from app.core.crypto import decrypt_borderless_token


class RecordingRedis:
    def __init__(self) -> None:
        self.values: dict[str, tuple[str, int | None]] = {}

    async def set(self, key, value, ex=None):
        self.values[key] = (value, ex)

    async def exists(self, key):
        return 1 if key in self.values else 0

    async def delete(self, key):
        self.values.pop(key, None)


class DownRedis:
    async def set(self, *args, **kwargs):
        raise RedisConnectionError('down')

    async def exists(self, *args):
        raise OSError('down')

    async def delete(self, *args):
        raise RedisConnectionError('down')


class SlowRedis:
    async def _wait(self, *args, **kwargs):
        await asyncio.sleep(5)

    set = exists = delete = _wait


async def test_put_stores_the_token_encrypted_for_its_lifetime():
    redis = RecordingRedis()
    store = BorderlessAccessStore(redis)  # ty: ignore[invalid-argument-type]

    await store.put(7, 'access-token', 3600)

    value, ttl = redis.values[access_key(7)]
    assert access_key(7) == 'applika:borderless:access:7'
    assert value != 'access-token'
    assert 'access-token' not in value
    assert decrypt_borderless_token(value) == 'access-token'
    assert ttl == 3600
    assert await store.present(7) is True
    assert await store.present(8) is False

    await store.drop(7)
    assert await store.present(7) is False


async def test_nothing_is_stored_without_a_key_or_a_lifetime(monkeypatch):
    redis = RecordingRedis()
    store = BorderlessAccessStore(redis)  # ty: ignore[invalid-argument-type]

    await store.put(7, 'access-token', 0)
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', None)
    await store.put(7, 'access-token', 3600)

    assert redis.values == {}


@pytest.mark.parametrize('redis', [DownRedis(), SlowRedis()])
async def test_redis_failing_is_missing_and_never_raises(
    redis, caplog, monkeypatch
):
    monkeypatch.setattr(borderless_access_store, 'TIMEOUT_SECONDS', 0.05)
    store = BorderlessAccessStore(redis)

    await store.put(7, 'access-token', 3600)
    assert await store.present(7) is False
    await store.drop(7)

    assert len(caplog.records) == 3
    assert all(r.levelname == 'WARNING' for r in caplog.records)
    assert all('access-token' not in r.getMessage() for r in caplog.records)
