import logging
import sys
import time
import uuid

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, DispatchFunction
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.logging import _filter_traceback, request_id_ctx

# Callbacks whose query carries an authorization code and a state
# (ADR-0026 §4): the request log never writes it.
_REDACTED_QUERY_PATHS = ('/auth/borderless/callback', '/auth/github/callback')
REDACTED_QUERY = '[redacted]'


def logged_query(path: str, query: str) -> str | None:
    """The query as the request log writes it: ``[redacted]`` on the
    sign-in callbacks, ``None`` when empty."""
    if not query:
        return None
    if path.rstrip('/').endswith(_REDACTED_QUERY_PATHS):
        return REDACTED_QUERY
    return query


def logged_url(request: Request) -> str:
    """The URL as the request log writes it (``?[redacted]`` on the
    sign-in callbacks)."""
    query = logged_query(request.url.path, request.url.query)
    if query is None:
        return str(request.url)
    return str(request.url.replace(query=query))


class CallbackQueryFilter(logging.Filter):
    """Redacts the sign-in callbacks' query in uvicorn's access log, whose
    record args are ``(client, method, path_with_query, http_version,
    status)``."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3:
            target = args[2]
            if isinstance(target, str) and '?' in target:
                path, _, query = target.partition('?')
                if logged_query(path, query) == REDACTED_QUERY:
                    record.args = (
                        *args[:2],
                        f'{path}?{REDACTED_QUERY}',
                        *args[3:],
                    )
        return True


def install_access_log_redaction() -> None:
    access = logging.getLogger('uvicorn.access')
    if not any(isinstance(f, CallbackQueryFilter) for f in access.filters):
        access.addFilter(CallbackQueryFilter())


class HTTPLifecycleMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app: ASGIApp, dispatch: DispatchFunction | None = None
    ) -> None:
        super().__init__(app, dispatch)
        self.logger = logging.getLogger('app')

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request_id_ctx.set(request_id)

        # The address uvicorn resolved, trusting the forwarded header only
        # from FORWARDED_ALLOW_IPS (ADR-0015, Plan corrections 1,
        # R-022). The raw header is never read directly here: anyone can
        # forge it.
        client_ip = request.client.host if request.client else 'unknown'

        url = logged_url(request)
        user_agent = request.headers.get('User-Agent', '-')
        content_type = request.headers.get('Content-Type', '-')

        self.logger.info(
            f'[{client_ip}][{request.method}][{url}]',
            extra={
                'extra_data': {
                    'event': 'request_start',
                    'method': request.method,
                    'path': str(request.url.path),
                    'query': logged_query(request.url.path, request.url.query),
                    'client_ip': client_ip,
                    'user_agent': user_agent,
                    'content_type': content_type,
                }
            },
        )

        start_time = time.perf_counter()

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            log_level = logging.INFO
            scode = response.status_code
            if scode >= 500:
                log_level = logging.ERROR
            elif scode >= 400:
                log_level = logging.WARNING

            self.logger.log(
                log_level,
                f'[{client_ip}][{request.method}][{url}][{scode}]',
                extra={
                    'extra_data': {
                        'event': 'request_end',
                        'method': request.method,
                        'path': str(request.url.path),
                        'status_code': scode,
                        'duration_ms': duration_ms,
                        'client_ip': client_ip,
                    }
                },
            )
        except Exception as err:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            filtered_tb = _filter_traceback(sys.exc_info())
            self.logger.critical(
                f'Unhandled exception: {type(err).__name__}: {err}',
                extra={
                    'extra_data': {
                        'event': 'request_error',
                        'method': request.method,
                        'path': str(request.url.path),
                        'duration_ms': duration_ms,
                        'client_ip': client_ip,
                        'error_type': type(err).__name__,
                        'traceback': filtered_tb,
                    }
                },
            )
            raise

        response.headers['X-Request-ID'] = request_id
        return response


class WebSocketLifecycleMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        self.logger = logging.getLogger('app')

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        request_id = str(uuid.uuid4())
        request_id_ctx.set(request_id)

        if scope['type'] == 'websocket':
            client = scope.get('client')
            path = scope.get('path')

            async def custom_receive():
                message = await receive()

                if message['type'] == 'websocket.connect':
                    self.logger.info(
                        'WebSocket connected',
                        extra={
                            'extra_data': {
                                'event': 'ws_connect',
                                'client': str(client),
                                'path': path,
                            }
                        },
                    )
                elif message['type'] == 'websocket.disconnect':
                    self.logger.info(
                        'WebSocket disconnected',
                        extra={
                            'extra_data': {
                                'event': 'ws_disconnect',
                                'client': str(client),
                                'path': path,
                            }
                        },
                    )

                return message

            try:
                return await self.app(scope, custom_receive, send)
            except Exception as e:
                filtered_tb = _filter_traceback(sys.exc_info())
                self.logger.error(
                    f'WebSocket error: {type(e).__name__}: {e}',
                    extra={
                        'extra_data': {
                            'event': 'ws_error',
                            'client': str(client),
                            'path': path,
                            'error_type': type(e).__name__,
                            'traceback': filtered_tb,
                        }
                    },
                )
                raise
        else:
            return await self.app(scope, receive, send)


def register_middleware(app: FastAPI) -> None:
    install_access_log_redaction()
    # Same ParamSpec-based _MiddlewareFactory false positive ty hits on
    # every add_middleware(<custom class>) call - see app/main.py.
    app.add_middleware(HTTPLifecycleMiddleware)  # ty: ignore[invalid-argument-type]
    app.add_middleware(WebSocketLifecycleMiddleware)  # ty: ignore[invalid-argument-type]
