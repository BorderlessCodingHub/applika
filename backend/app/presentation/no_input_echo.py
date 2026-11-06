"""A route class whose 422 never echoes the submitted input.

Used where a request carries a secret: the admin report webhook URL and
the Borderless password.
"""

from fastapi import Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute


class NoInputEchoRoute(APIRoute):
    """A ``RequestValidationError`` on this router never echoes ``input``.

    FastAPI's default 422 handler echoes the value that failed validation
    for every error, and for a *missing* field that value is pydantic's
    ``input`` for the whole enclosing model - i.e. the whole submitted
    body, ``webhook_url`` included. The default handler also echoes
    whatever the caller actually sent for a type-mismatch error (a list,
    a form-encoded body, a bare JSON string), any of which could carry the
    webhook URL or its token segment. This route class strips ``input``
    from every error on this router **only** - the global handler and
    every other route's 422 shape (installed ``applika-cli`` versions
    included) are untouched.
    """

    def get_route_handler(self):
        original_route_handler = super().get_route_handler()

        async def custom_route_handler(request: Request) -> Response:
            try:
                return await original_route_handler(request)
            except RequestValidationError as exc:
                errors = [
                    {
                        key: value
                        for key, value in error.items()
                        if key != 'input'
                    }
                    for error in exc.errors()
                ]
                for error in errors:
                    if 'loc' in error:
                        error['loc'] = list(error['loc'])
                return JSONResponse(status_code=422, content={'detail': errors})

        return custom_route_handler
