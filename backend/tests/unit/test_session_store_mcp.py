"""The MCP half of the session store (ADR-0028): the token's shape, only
its sha256 in Redis, one MULTI, and the end script's keys. The scripts'
behaviour runs on a real Redis in tests/integration/test_mcp_server.py."""

import hashlib
import re
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import pytest
import redis.asyncio as redis
from redis.exceptions import RedisError

from app.application.services import session_store
from app.application.services.session_store import (
    _END_LUA,
    _RESOLVE_MCP_LUA,
    ID_PREFIX,
    MCP_PREFIX,
    REFRESH_PREFIX,
    SessionStore,
    mcp_key,
    mcp_token_hash,
    new_mcp_token,
)
from app.core.exceptions import SessionServiceUnavailable

TOKEN_SHAPE = re.compile(r'applika_mcp_[A-Za-z0-9_-]{43}')


class _Pipeline:
    def __init__(self, calls: list[tuple[str, tuple, dict]]):
        self.calls = calls

    def set(self, *args, **kwargs):
        self.calls.append(('set', args, kwargs))

    def hset(self, *args, **kwargs):
        self.calls.append(('hset', args, kwargs))

    def expireat(self, *args, **kwargs):
        self.calls.append(('expireat', args, kwargs))

    async def execute(self):
        self.calls.append(('execute', (), {}))
        return [True, 1, True]


class _Script:
    def __init__(self, source: str, owner: '_Redis'):
        self.source = source
        self.owner = owner

    async def __call__(self, keys, args):
        self.owner.script_calls.append((self.source, keys, args))
        if self.owner.fail:
            raise RedisError('down')
        return self.owner.answer


class _Redis:
    def __init__(self, answer: Any = None, fail: bool = False):
        self.calls: list[tuple[str, tuple, dict]] = []
        self.script_calls: list[tuple[str, list, list]] = []
        self.answer = answer
        self.fail = fail
        self.transactions: list[bool] = []

    def register_script(self, source: str) -> _Script:
        return _Script(source, self)

    def pipeline(self, transaction: bool = True) -> _Pipeline:
        self.transactions.append(transaction)
        return _Pipeline(self.calls)


def _store(fake: _Redis) -> SessionStore:
    return SessionStore(cast(redis.Redis, fake))


def test_a_new_token_is_the_prefix_and_43_base64url_characters():
    tokens = {new_mcp_token() for _ in range(50)}
    assert len(tokens) == 50
    assert all(TOKEN_SHAPE.fullmatch(token) for token in tokens)


def test_the_redis_key_is_the_sha256_hex_of_the_token():
    token = 'applika_mcp_fake_' + '0' * 38
    digest = hashlib.sha256(token.encode()).hexdigest()
    assert mcp_token_hash(token) == digest
    assert mcp_key(digest) == f'applika:mcp:{digest}'
    assert MCP_PREFIX == 'applika:mcp:'


async def test_open_mcp_writes_both_keys_in_one_multi_and_never_the_token():
    fake = _Redis()
    expires_at = datetime.now(UTC) + timedelta(days=90)
    token = await _store(fake).open_mcp(
        42, 7, 'read write', expires_at, '10.0.0.1'
    )
    assert TOKEN_SHAPE.fullmatch(token)
    digest = mcp_token_hash(token)
    exat = int(expires_at.timestamp())
    assert fake.transactions == [True]
    assert fake.calls == [
        ('set', (f'applika:mcp:{digest}', '42'), {'exat': exat}),
        (
            'hset',
            (f'{ID_PREFIX}42',),
            {
                'mapping': {
                    'rk': '',
                    'mk': digest,
                    'scope': 'read write',
                    'user_id': '7',
                    'last_used_at': '',
                    'last_ip': '10.0.0.1',
                }
            },
        ),
        ('expireat', (f'{ID_PREFIX}42', exat), {}),
        ('execute', (), {}),
    ]
    assert token not in repr(fake.calls)


async def test_resolve_mcp_sends_the_hash_and_answers_the_session():
    fake = _Redis(answer=['42', '7', 'read write'])
    token = new_mcp_token()
    slide_to = datetime(2027, 2, 1, tzinfo=UTC)
    now = datetime(2026, 11, 14, tzinfo=UTC)
    found = await _store(fake).resolve_mcp(token, '10.0.0.9', slide_to, now)
    assert found is not None
    assert (found.session_id, found.user_id, found.scope) == (
        42,
        7,
        'read write',
    )
    source, keys, args = fake.script_calls[0]
    assert source == _RESOLVE_MCP_LUA
    assert keys == [mcp_key(mcp_token_hash(token))]
    assert args == [
        ID_PREFIX,
        mcp_token_hash(token),
        now.isoformat(),
        '10.0.0.9',
        int(slide_to.timestamp()),
    ]
    assert token not in repr(fake.script_calls)


@pytest.mark.parametrize('answer', [None, ['x', '7', 'read']])
async def test_resolve_mcp_answers_none_for_a_gone_or_garbled_session(
    answer,
):
    fake = _Redis(answer=answer)
    found = await _store(fake).resolve_mcp(
        new_mcp_token(), None, datetime.now(UTC)
    )
    assert found is None


async def test_resolve_mcp_fails_closed():
    fake = _Redis(fail=True)
    with pytest.raises(SessionServiceUnavailable):
        await _store(fake).resolve_mcp(
            new_mcp_token(), None, datetime.now(UTC)
        )


async def test_end_passes_both_prefixes_to_the_end_script():
    fake = _Redis(answer=1)
    await _store(fake).end(42)
    assert fake.script_calls == [
        (_END_LUA, [f'{ID_PREFIX}42'], [REFRESH_PREFIX, MCP_PREFIX])
    ]


def test_the_end_script_skips_an_empty_refresh_value_and_ends_the_token():
    """An MCP hash has ``rk = ''``: ending it must never DEL the bare
    ``applika:session:`` key, and must DEL ``applika:mcp:<mk>``."""
    assert "rk and rk ~= ''" in _END_LUA
    assert "mk and mk ~= ''" in _END_LUA
    assert "ARGV[2] .. mk" in _END_LUA


def test_the_resolve_script_checks_the_hash_points_back_at_the_token():
    assert "HGET', hk, 'mk') ~= ARGV[2]" in _RESOLVE_MCP_LUA
    assert _RESOLVE_MCP_LUA.count('EXPIREAT') == 2
    assert session_store.TOUCH_TIMEOUT_SECONDS == 0.5
