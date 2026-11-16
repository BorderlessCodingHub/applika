"""Talk to ``POST /mcp`` in tests (ADR-0028): the session manager running
(``mcp_runtime.run()``, what the app's lifespan enters), the adapter's
``deps`` swapped to the test database, Redis and job queue, and one
JSON-RPC helper."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from itertools import count
from typing import Any

import redis.asyncio as redis
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.main import app as main_app
from app.presentation.mcp.deps import deps
from app.presentation.mcp.server import mcp_runtime

MCP_HEADERS = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
}
_ids = count(1)


@asynccontextmanager
async def mcp_app(
    async_engine: AsyncEngine, redis_client: redis.Redis, job_queue: Any
) -> AsyncIterator[AsyncClient]:
    saved = (deps.session_factory, deps.redis_factory, deps.job_queue_factory)
    deps.session_factory = async_sessionmaker(
        bind=async_engine, expire_on_commit=False
    )
    deps.redis_factory = lambda: redis_client
    deps.job_queue_factory = lambda _redis: job_queue
    # The manager's task group is entered and left in one task of its own,
    # as a server's lifespan task does: pytest-asyncio may run a fixture's
    # setup and teardown in different tasks.
    started, stop = asyncio.Event(), asyncio.Event()

    async def lifespan() -> None:
        async with mcp_runtime.run():
            started.set()
            await stop.wait()

    runner = asyncio.create_task(lifespan())
    try:
        await started.wait()
        async with AsyncClient(
            transport=ASGITransport(app=main_app),
            base_url='http://test/api',
        ) as client:
            yield client
    finally:
        stop.set()
        await runner
        deps.session_factory, deps.redis_factory, deps.job_queue_factory = (
            saved
        )


async def rpc(
    client: AsyncClient,
    token: str | None,
    method: str,
    params: dict[str, Any] | None = None,
) -> Response:
    headers = dict(MCP_HEADERS)
    if token is not None:
        headers['Authorization'] = f'Bearer {token}'
    body: dict[str, Any] = {
        'jsonrpc': '2.0',
        'id': next(_ids),
        'method': method,
    }
    if params is not None:
        body['params'] = params
    return await client.post('/mcp', json=body, headers=headers)


async def result(
    client: AsyncClient,
    token: str,
    method: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = await rpc(client, token, method, params)
    assert response.status_code == 200, response.text
    assert response.headers['content-type'].startswith('application/json')
    payload = response.json()
    assert 'error' not in payload, payload
    return payload['result']


async def call(
    client: AsyncClient,
    token: str,
    name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """A ``tools/call`` result: ``content``, ``structuredContent``,
    ``isError``."""
    return await result(
        client,
        token,
        'tools/call',
        {'name': name, 'arguments': arguments or {}},
    )


async def tool_names(client: AsyncClient, token: str) -> set[str]:
    listed = await result(client, token, 'tools/list')
    return {tool['name'] for tool in listed['tools']}
