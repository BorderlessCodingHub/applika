import logging
import sys
import time
import uuid

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, DispatchFunction
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.logging import _filter_traceback, request_id_ctx


class HTTPLifecycleMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app: ASGIApp, dispatch: DispatchFunction | None = None
    ) -> None:
        super().__init__(app, dispatch)
        self.logger = logging.getLogger('app')

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request_id_ctx.set(request_id)

        client_ip = (
            request.headers.get('X-Forwarded-For', request.client.host)
            .split(',')[0]
            .strip()
        )

        user_agent = request.headers.get('User-Agent', '-')
        content_type = request.headers.get('Content-Type', '-')

        self.logger.info(
            'Incoming request',
            extra={'extra_data': {
                'event': 'request_start',
                'method': request.method,
                'path': str(request.url.path),
                'query': str(request.url.query) or None,
                'client_ip': client_ip,
                'user_agent': user_agent,
                'content_type': content_type,
            }},
        )

        start_time = time.perf_counter()

        try:
            response = await call_next(request)
            duration_ms = round(
                (time.perf_counter() - start_time) * 1000, 2
            )

            log_level = logging.INFO
            if response.status_code >= 500:
                log_level = logging.ERROR
            elif response.status_code >= 400:
                log_level = logging.WARNING

            self.logger.log(
                log_level,
                'Request completed',
                extra={'extra_data': {
                    'event': 'request_end',
                    'method': request.method,
                    'path': str(request.url.path),
                    'status_code': response.status_code,
                    'duration_ms': duration_ms,
                    'client_ip': client_ip,
                }},
            )
        except Exception as err:
            duration_ms = round(
                (time.perf_counter() - start_time) * 1000, 2
            )
            filtered_tb = _filter_traceback(sys.exc_info())
            self.logger.critical(
                f'Unhandled exception: {type(err).__name__}: {err}',
                extra={'extra_data': {
                    'event': 'request_error',
                    'method': request.method,
                    'path': str(request.url.path),
                    'duration_ms': duration_ms,
                    'client_ip': client_ip,
                    'error_type': type(err).__name__,
                    'traceback': filtered_tb,
                }},
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
                        extra={'extra_data': {
                            'event': 'ws_connect',
                            'client': str(client),
                            'path': path,
                        }},
                    )
                elif message['type'] == 'websocket.disconnect':
                    self.logger.info(
                        'WebSocket disconnected',
                        extra={'extra_data': {
                            'event': 'ws_disconnect',
                            'client': str(client),
                            'path': path,
                        }},
                    )

                return message

            try:
                return await self.app(scope, custom_receive, send)
            except Exception as e:
                filtered_tb = _filter_traceback(sys.exc_info())
                self.logger.error(
                    f'WebSocket error: {type(e).__name__}: {e}',
                    extra={'extra_data': {
                        'event': 'ws_error',
                        'client': str(client),
                        'path': path,
                        'error_type': type(e).__name__,
                        'traceback': filtered_tb,
                    }},
                )
                raise
        else:
            return await self.app(scope, receive, send)


def register_middleware(app: FastAPI) -> None:
    app.add_middleware(HTTPLifecycleMiddleware)
    app.add_middleware(WebSocketLifecycleMiddleware)
