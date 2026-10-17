"""``RateLimitMiddleware`` (KODI-039, ADR-0015): pure ASGI, wraps every HTTP
route in the fixed-window Redis limiter of ``app/core/rate_limit.py``.

Shape copied from ``app/presentation/deprecation.py``
(``DeprecationHeaderMiddleware``): a pure ASGI class, ``MutableHeaders`` on
``http.response.start``. Installed in ``app/main.py`` ABOVE the CORS
middleware, so CORS wraps it: a 429 carries ``Access-Control-Allow-Origin``
and a preflight ``OPTIONS`` is answered (and never counted) before this
middleware runs.
"""

import time

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config.redis import get_redis
from app.config.settings import envs
from app.core.rate_limit import bucket_for, hit, subject_for

RATE_LIMIT_HEADERS = (
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
)


class RateLimitMiddleware:
    """Counts every HTTP request in Redis and refuses one over the limit."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        if scope['type'] != 'http' or scope['method'] == 'OPTIONS':
            await self.app(scope, receive, send)
            return

        if not envs.RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return

        path = scope['path']
        root_path = scope.get('root_path') or ''
        if root_path and path.startswith(root_path):
            path = path[len(root_path) :]

        get_redis_override = scope['app'].dependency_overrides.get(
            get_redis, get_redis
        )
        redis_client = await get_redis_override()

        request = Request(scope)
        client = scope.get('client')
        client_host = client[0] if client else None

        bucket = bucket_for(path)
        subject = subject_for(request.headers, request.cookies, client_host)
        limit = (
            envs.RATE_LIMIT_AUTH
            if bucket == 'auth'
            else envs.RATE_LIMIT_DEFAULT
        )

        decision = await hit(
            redis_client,
            bucket,
            subject,
            limit,
            envs.RATE_LIMIT_WINDOW_SECONDS,
            time.time(),
        )

        if decision is None:
            await self.app(scope, receive, send)
            return

        if not decision.allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    'detail': (
                        'Too many requests. Try again in '
                        f'{decision.reset_after} seconds.'
                    )
                },
                headers={
                    'Retry-After': str(decision.reset_after),
                    'X-RateLimit-Limit': str(decision.limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(decision.reset_after),
                },
            )
            await response(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message['type'] == 'http.response.start':
                headers = MutableHeaders(scope=message)
                headers['X-RateLimit-Limit'] = str(decision.limit)
                headers['X-RateLimit-Remaining'] = str(decision.remaining)
                headers['X-RateLimit-Reset'] = str(decision.reset_after)
            await send(message)

        await self.app(scope, receive, send_with_headers)
