import logging
import uuid

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, DispatchFunction
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.logging import request_id_ctx


# Middleware to intercept every request and gerenare a request_id
class HTTPLifecycleMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app: ASGIApp, dispatch: DispatchFunction | None = None
    ) -> None:
        super().__init__(app, dispatch)
        self.logger = logging.getLogger('app')

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request_id_ctx.set(request_id)

        # Forward client ip
        client_ip = (
            request.headers.get('X-Forwarded-For', request.client.host)
            .split(',')[0]
            .strip()
        )

        # request logging
        self.logger.info(f'[{client_ip}][{request.method}][{request.url}]')

        try:
            response = await call_next(request)
            scode = response.status_code

            # response logging
            self.logger.info(
                f'[{client_ip}][{request.method}][{request.url}][{scode}]'
            )
        except Exception as err:
            # response logging
            self.logger.exception(
                f'{str(err)}\n', exc_info=err, stack_info=True
            )

        response.headers['X-Request-ID'] = request_id
        return response


# Middleware to intercept every websocket request and gerenare a request_id
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
                        f'WebSocket connected: {client} on {path}'
                    )

                elif message['type'] == 'websocket.disconnect':
                    self.logger.info(
                        f'WebSocket disconnected: {client} from {path}'
                    )

                return message

            try:
                return await self.app(scope, custom_receive, send)
            except Exception as e:
                self.logger.error(
                    f'WebSocket error with {client} on {path}: {e}'
                )
                raise
        else:
            return await self.app(scope, receive, send)


def register_middleware(app: FastAPI) -> None:
    app.add_middleware(HTTPLifecycleMiddleware)
    app.add_middleware(WebSocketLifecycleMiddleware)
