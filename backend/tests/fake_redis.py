"""A tiny in-memory Redis for use-case tests: only the calls the sign-in
limiter and the account-link nonce make."""

import time


class _Pipeline:
    def __init__(self, redis: 'FakeRedis') -> None:
        self.redis = redis
        self.ops: list[tuple] = []

    def incr(self, key: str):
        self.ops.append(('incr', key))

    def expire(self, key: str, seconds: int, nx: bool = False):
        self.ops.append(('expire', key, seconds, nx))

    async def execute(self) -> list:
        results = []
        for op in self.ops:
            if op[0] == 'incr':
                results.append(await self.redis.incr(op[1]))
            else:
                results.append(await self.redis.expire(*op[1:]))
        self.ops = []
        return results


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.expiry: dict[str, float] = {}
        self.fail: Exception | None = None

    def _check(self) -> None:
        if self.fail is not None:
            raise self.fail

    def _alive(self, key: str) -> bool:
        deadline = self.expiry.get(key)
        if deadline is not None and deadline <= time.time():
            self.data.pop(key, None)
            self.expiry.pop(key, None)
        return key in self.data

    async def get(self, key: str) -> str | None:
        self._check()
        return self.data[key] if self._alive(key) else None

    async def set(self, key: str, value: str, ex: int | None = None):
        self._check()
        self.data[key] = value
        if ex:
            self.expiry[key] = time.time() + ex
        return True

    async def getdel(self, key: str) -> str | None:
        self._check()
        value = await self.get(key)
        self.data.pop(key, None)
        self.expiry.pop(key, None)
        return value

    async def incr(self, key: str) -> int:
        self._check()
        value = int(self.data[key]) + 1 if self._alive(key) else 1
        self.data[key] = str(value)
        return value

    async def expire(self, key: str, seconds: int, nx: bool = False) -> bool:
        self._check()
        if not self._alive(key) or (nx and key in self.expiry):
            return False
        self.expiry[key] = time.time() + seconds
        return True

    async def ttl(self, key: str) -> int:
        self._check()
        if not self._alive(key):
            return -2
        deadline = self.expiry.get(key)
        return -1 if deadline is None else int(deadline - time.time()) + 1

    async def delete(self, *keys: str) -> int:
        self._check()
        removed = 0
        for key in keys:
            removed += int(self.data.pop(key, None) is not None)
            self.expiry.pop(key, None)
        return removed

    def pipeline(self, transaction: bool = True) -> _Pipeline:
        self._check()
        return _Pipeline(self)
