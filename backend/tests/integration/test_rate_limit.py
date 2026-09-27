"""Integration tests for the rate limiter (KODI-039, ADR-0015, T033).

Uses ``redis_client`` (a real Redis testcontainer, overriding ``get_redis``)
and low limits set through ``monkeypatch`` on ``envs``. The limiter is OFF
by default (``tests/conftest.py``); every test here turns it back on.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.tokens import create_access_token
from app.domain.models import ApplicationModel
from app.main import app as main_app


def _enable_limiter(monkeypatch, default=3, auth=2, window=60):
    monkeypatch.setattr(envs, 'RATE_LIMIT_ENABLED', True)
    monkeypatch.setattr(envs, 'RATE_LIMIT_DEFAULT', default)
    monkeypatch.setattr(envs, 'RATE_LIMIT_AUTH', auth)
    monkeypatch.setattr(envs, 'RATE_LIMIT_WINDOW_SECONDS', window)


@pytest.fixture
async def no_prefix_client(async_client):
    """A client whose base_url carries no ``/api`` segment, simulating a
    proxy that has already stripped the prefix (Plan corrections 9)."""
    transport = ASGITransport(app=main_app)
    async with AsyncClient(
        transport=transport, base_url='http://test'
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# Refusal
# ---------------------------------------------------------------------------


async def test_over_limit_refuses_with_429_body_and_headers(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=2)

    for _ in range(2):
        ok = await async_client.get('/supports')
        assert ok.status_code == 200

    refused = await async_client.get('/supports')
    assert refused.status_code == 429
    body = refused.json()
    assert body['detail'].startswith('Too many requests. Try again in ')
    assert body['detail'].endswith(' seconds.')

    retry_after = int(refused.headers['Retry-After'])
    assert 1 <= retry_after <= envs.RATE_LIMIT_WINDOW_SECONDS

    assert refused.headers['X-RateLimit-Limit'] == '2'
    assert refused.headers['X-RateLimit-Remaining'] == '0'
    assert int(refused.headers['X-RateLimit-Reset']) == retry_after


async def test_repeated_429s_do_not_push_the_window_end(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=1, window=60)

    await async_client.get('/supports')
    first_refusal = await async_client.get('/supports')
    assert first_refusal.status_code == 429

    keys = await redis_client.keys('applika:ratelimit:default:*')
    assert len(keys) == 1
    ttl_after_first_429 = await redis_client.ttl(keys[0])

    second_refusal = await async_client.get('/supports')
    assert second_refusal.status_code == 429
    ttl_after_second_429 = await redis_client.ttl(keys[0])

    # Same window -> same expiry, within the second of pipeline round trips.
    assert abs(ttl_after_second_429 - ttl_after_first_429) <= 1


async def test_429_writes_no_application_row(
    async_client, redis_client, db_session: AsyncSession, monkeypatch
):
    _enable_limiter(monkeypatch, default=1)

    await async_client.get('/supports')  # consume the one allowed request

    before = (
        (await db_session.execute(select(ApplicationModel.id))).scalars().all()
    )

    payload = {
        'company': 'Rate Limited Co',
        'role': 'Should Not Be Created',
        'mode': 'active',
        'application_date': '2025-12-01',
    }
    refused = await async_client.post('/applications', json=payload)
    assert refused.status_code == 429

    after = (
        (await db_session.execute(select(ApplicationModel.id))).scalars().all()
    )
    assert after == before


# ---------------------------------------------------------------------------
# Headers under the limit
# ---------------------------------------------------------------------------


async def test_under_limit_carries_the_three_headers(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=5)

    response = await async_client.get('/supports')
    assert response.status_code == 200
    assert response.headers['X-RateLimit-Limit'] == '5'
    assert response.headers['X-RateLimit-Remaining'] == '4'
    assert int(response.headers['X-RateLimit-Reset']) >= 1


# ---------------------------------------------------------------------------
# Subjects
# ---------------------------------------------------------------------------


async def test_two_users_at_the_limit_on_the_same_ip_do_not_share_quota(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=2)

    token_a, _, _ = create_access_token('user-a')
    token_b, _, _ = create_access_token('user-b')

    for _ in range(2):
        ok = await async_client.get(
            '/supports', cookies={ACCESS_COOKIE_NAME: token_a}
        )
        assert ok.status_code == 200

    refused = await async_client.get(
        '/supports', cookies={ACCESS_COOKIE_NAME: token_a}
    )
    assert refused.status_code == 429

    # Same connection (same IP), a different user's session: unaffected.
    other_user = await async_client.get(
        '/supports', cookies={ACCESS_COOKIE_NAME: token_b}
    )
    assert other_user.status_code == 200


async def test_anonymous_requests_count_per_ip_second_ip_unaffected(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=1)

    first = await async_client.get('/supports')
    assert first.status_code == 200
    refused = await async_client.get('/supports')
    assert refused.status_code == 429

    other_ip_transport = ASGITransport(app=main_app, client=('10.0.0.2', 123))
    async with AsyncClient(
        transport=other_ip_transport, base_url='http://test/api'
    ) as other_ip_client:
        other_ip_client.cookies = async_client.cookies
        response = await other_ip_client.get('/supports')
        assert response.status_code == 200


async def test_expired_token_counts_against_the_ip(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=1)

    expired_payload = {
        'sub': 'user-expired',
        'kind': 'access',
        'exp': datetime.now(UTC) - timedelta(minutes=1),
    }
    expired_token = jwt.encode(
        expired_payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM
    )

    first = await async_client.get(
        '/supports', cookies={ACCESS_COOKIE_NAME: expired_token}
    )
    assert first.status_code == 200

    # Same IP, anonymous this time (no cookie): shares the IP bucket.
    refused = await async_client.get('/supports')
    assert refused.status_code == 429


# ---------------------------------------------------------------------------
# Buckets
# ---------------------------------------------------------------------------


async def test_auth_and_default_buckets_count_separately(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=1, auth=1)

    default_ok = await async_client.get('/supports')
    assert default_ok.status_code == 200
    default_refused = await async_client.get('/supports')
    assert default_refused.status_code == 429

    # /auth/refresh has its own bucket, untouched by the default bucket above.
    auth_ok = await async_client.get('/auth/refresh')
    assert auth_ok.status_code != 429
    auth_refused = await async_client.get('/auth/refresh')
    assert auth_refused.status_code == 429


async def test_both_path_shapes_land_in_the_auth_bucket(
    async_client, no_prefix_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, auth=1)

    with_prefix = await async_client.get('/auth/refresh')
    assert with_prefix.status_code != 429

    # Same bucket: the second request, whichever path shape, is refused.
    without_prefix = await no_prefix_client.get('/auth/refresh')
    assert without_prefix.status_code == 429


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


async def test_429_with_origin_carries_cors_headers(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=1)

    await async_client.get('/supports')
    refused = await async_client.get(
        '/supports', headers={'Origin': 'http://127.0.0.1:8080'}
    )
    assert refused.status_code == 429
    assert (
        refused.headers['access-control-allow-origin']
        == 'http://127.0.0.1:8080'
    )
    exposed = refused.headers['access-control-expose-headers']
    for header in (
        'Retry-After',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
    ):
        assert header in exposed


async def test_preflight_options_not_counted(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=1)

    preflight = await async_client.options(
        '/supports',
        headers={
            'Origin': 'http://127.0.0.1:8080',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert 'X-RateLimit-Limit' not in preflight.headers

    # The one real request afterwards still has the full quota available.
    response = await async_client.get('/supports')
    assert response.status_code == 200
    assert response.headers['X-RateLimit-Remaining'] == '0'


# ---------------------------------------------------------------------------
# Switch and failure
# ---------------------------------------------------------------------------


async def test_disabled_never_429s_and_carries_no_headers(
    async_client, redis_client, monkeypatch
):
    monkeypatch.setattr(envs, 'RATE_LIMIT_ENABLED', False)
    monkeypatch.setattr(envs, 'RATE_LIMIT_DEFAULT', 1)

    for _ in range(5):
        response = await async_client.get('/supports')
        assert response.status_code == 200
        assert 'X-RateLimit-Limit' not in response.headers


async def test_redis_closed_fails_open_with_warning(
    async_client, monkeypatch, caplog
):
    import logging

    import redis.asyncio as redis

    from app.config.redis import get_redis
    from app.main import app as main_app

    _enable_limiter(monkeypatch, default=1)
    caplog.set_level(logging.WARNING, logger='app')

    # A private client pointed at nothing - not the shared `redis_client`
    # fixture, so its own teardown is untouched. `aclose()` alone would not
    # do: redis-py's connection pool reconnects transparently on the next
    # command, so the failure has to be a real, unreachable connection.
    unreachable_client = redis.from_url(
        'redis://127.0.0.1:1/0',
        decode_responses=True,
        socket_connect_timeout=0.2,
    )

    async def override_get_redis():
        return unreachable_client

    main_app.dependency_overrides[get_redis] = override_get_redis

    response = await async_client.get('/supports')

    assert response.status_code == 200
    assert 'X-RateLimit-Limit' not in response.headers
    assert any(
        'rate_limit_unavailable' in r.getMessage() for r in caplog.records
    )


async def test_key_ttl_is_bounded_by_window_end_plus_one(
    async_client, redis_client, monkeypatch
):
    _enable_limiter(monkeypatch, default=5, window=60)

    await async_client.get('/supports')
    keys = await redis_client.keys('applika:ratelimit:default:*')
    assert len(keys) == 1
    ttl = await redis_client.ttl(keys[0])
    assert 0 < ttl <= 61


async def test_window_setting_is_actually_read(
    async_client, redis_client, monkeypatch
):
    """AC5: RATE_LIMIT_WINDOW_SECONDS itself comes from configuration, not
    a hard-coded literal - a small, distinctive window (5, not the 60 every
    other test in this module uses) has to show up in Retry-After,
    X-RateLimit-Reset and the key's own Redis TTL."""
    _enable_limiter(monkeypatch, default=1, window=5)

    await async_client.get('/supports')
    refused = await async_client.get('/supports')
    assert refused.status_code == 429

    assert 1 <= int(refused.headers['Retry-After']) <= 5
    assert 1 <= int(refused.headers['X-RateLimit-Reset']) <= 5

    keys = await redis_client.keys('applika:ratelimit:default:*')
    assert len(keys) == 1
    ttl = await redis_client.ttl(keys[0])
    assert 0 < ttl <= 6


# ---------------------------------------------------------------------------
# AC7 — the forwarded header only counts from a trusted proxy
# ---------------------------------------------------------------------------


async def test_forwarded_for_only_counted_from_a_trusted_proxy(
    redis_client, monkeypatch
):
    """The limiter never reads the raw header (R-022): it counts whatever
    ``scope['client']`` says, and only uvicorn's own
    ``ProxyHeadersMiddleware`` - honouring ``trusted_hosts`` - may rewrite
    that from ``X-Forwarded-For``. A trusted peer's forwarded address changes
    the counted subject; an untrusted peer's does not."""
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

    _enable_limiter(monkeypatch, default=100)

    # ty ignores: ProxyHeadersMiddleware/ASGITransport are typed against
    # ASGI's own ParamSpec-based protocol, which ty cannot match a FastAPI
    # app or another ASGI middleware class against - same false positive as
    # add_middleware in app/main.py.
    proxied_app = ProxyHeadersMiddleware(
        main_app,  # ty: ignore[invalid-argument-type]
        trusted_hosts=['127.0.0.1'],
    )

    # A request from the trusted proxy address (127.0.0.1) carrying
    # X-Forwarded-For: uvicorn rewrites scope['client'] to the forwarded
    # address, and that is what the limiter counts.
    trusted_transport = ASGITransport(
        app=proxied_app,  # ty: ignore[invalid-argument-type]
        client=('127.0.0.1', 123),
    )
    async with AsyncClient(
        transport=trusted_transport, base_url='http://test/api'
    ) as trusted_client:
        await trusted_client.get(
            '/supports', headers={'X-Forwarded-For': '203.0.113.5'}
        )

    forwarded_keys = await redis_client.keys(
        'applika:ratelimit:default:ip:203.0.113.5:*'
    )
    assert len(forwarded_keys) == 1

    # A request from an address NOT in trusted_hosts carrying the same
    # header: uvicorn ignores it, and the limiter counts the real peer.
    untrusted_transport = ASGITransport(
        app=proxied_app,  # ty: ignore[invalid-argument-type]
        client=('10.0.0.9', 123),
    )
    async with AsyncClient(
        transport=untrusted_transport, base_url='http://test/api'
    ) as untrusted_client:
        await untrusted_client.get(
            '/supports', headers={'X-Forwarded-For': '203.0.113.5'}
        )

    still_one = await redis_client.keys(
        'applika:ratelimit:default:ip:203.0.113.5:*'
    )
    assert len(still_one) == 1  # unaffected by the untrusted request

    real_peer_keys = await redis_client.keys(
        'applika:ratelimit:default:ip:10.0.0.9:*'
    )
    assert len(real_peer_keys) == 1

    # The limiter/log path itself never *reads* the raw header (T031) - a
    # code comment mentioning it (like this test's own docstring, or the
    # explanatory comment left in middleware.py) is fine; an actual read
    # (``.get('X-Forwarded-For'`` or ``['X-Forwarded-For']``) is not.
    import subprocess
    from pathlib import Path

    app_dir = Path(__file__).resolve().parents[2] / 'app'
    grep = subprocess.run(
        [
            'grep',
            '-rnE',
            r"""(get|\[)\(?['"]X-Forwarded-For['"]""",
            str(app_dir),
        ],
        capture_output=True,
        text=True,
    )
    assert grep.stdout == ''
