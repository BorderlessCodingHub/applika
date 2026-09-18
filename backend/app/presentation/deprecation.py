"""The ``Deprecation`` response header of the compat routes (R-020).

The routes installed ``applika-cli`` 0.1.4 still calls on the old model
(``/applications/{id}/steps[/{sid}]`` and ``/applications/{id}/finalize``
with a body) answer with::

    Deprecation: @1789430400

RFC 9745 (March 2025) defines the field as an HTTP structured-field *Date*:
``@`` and the Unix time at which the resource was deprecated. The bare
``true`` of the earlier drafts is not valid under the RFC, so the RFC form
wins. The date is 2026-09-15T00:00:00Z, the day ADR 0012 was accepted and
deprecated these routes. There is deliberately **no** ``Sunset`` header and
no removal date: removing the routes is a later owner decision
(.claude/rules/cli-compatibility.md 5).

A route opts in by depending on :func:`mark_deprecated` (or calling it); the
flag lives in the ASGI scope's ``state``, and
:class:`DeprecationHeaderMiddleware` stamps the header on whatever response
leaves for that request, errors included (404, 409, 422 from a use case or
from request validation), since a router dependency runs before the body is
validated.
"""

from datetime import UTC, datetime

from fastapi import Request
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEPRECATION_HEADER = 'Deprecation'
DEPRECATED_SINCE = datetime(2026, 9, 15, tzinfo=UTC)
DEPRECATION_VALUE = f'@{int(DEPRECATED_SINCE.timestamp())}'
_STATE_KEY = 'applika_deprecated_route'


def mark_deprecated(request: Request) -> None:
    """Flag the current request as served by a deprecated route."""
    setattr(request.state, _STATE_KEY, True)


class DeprecationHeaderMiddleware:
    """Adds ``Deprecation`` to every response of a flagged request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        async def send_with_header(message: Message) -> None:
            if message['type'] == 'http.response.start' and scope.get(
                'state', {}
            ).get(_STATE_KEY):
                MutableHeaders(scope=message)[DEPRECATION_HEADER] = (
                    DEPRECATION_VALUE
                )
            await send(message)

        await self.app(scope, receive, send_with_header)
