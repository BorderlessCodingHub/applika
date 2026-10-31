from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.utils import is_body_allowed_for_status_code
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from app.core import exceptions
from app.core.error_codes import ErrorCode

SESSION_RETRY_AFTER_SECONDS = 5

# Every handler below is typed ``exc: Exception`` and narrows with an
# ``assert isinstance(...)`` rather than the exact exception subclass.
# Starlette's ``add_exception_handler`` declares its ``handler`` parameter as
# accepting ``(Request, Exception, /) -> ...`` - contravariant in ``exc`` - so
# a handler typed against a narrower subclass is not actually a valid
# ``ExceptionHandler`` by that signature, and ``ty`` flags every one of the
# nine registrations below for it (KODI-017 QA finding N1). The assert keeps
# the handler body reading exactly as it did before - ``exc.message`` still
# resolves against the real subclass - while making the file ``ty``-clean,
# per quality-gates.md's "files a slice creates or changes must be clean".
#
# Every body carries ``code`` next to the unchanged ``detail``, then
# ``params`` only when the exception sets it (ADR-0025): ``exc.body()``.

INTERNAL_SERVER_ERROR = 'Internal Server Error'
NOT_IMPLEMENTED = 'This endpoint has been defined but not yet implemented'

# Statuses the framework raises by itself (routing, body parsing).
_FRAMEWORK_CODES = {
    400: ErrorCode.GEN_BODY_UNPARSABLE,
    404: ErrorCode.GEN_NOT_FOUND,
    405: ErrorCode.GEN_METHOD_NOT_ALLOWED,
}


async def _not_implemented_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=501,
        content={
            'detail': NOT_IMPLEMENTED,
            'code': ErrorCode.GEN_NOT_IMPLEMENTED.value,
        },
    )


async def _http_exception_handler(request: Request, exc: Exception):
    """Starlette's own errors (unknown route 404, 405, body parse 400):
    FastAPI's default answer plus ``code``, headers kept (``Allow``)."""
    assert isinstance(exc, StarletteHTTPException)
    headers = getattr(exc, 'headers', None)
    if not is_body_allowed_for_status_code(exc.status_code):
        return Response(status_code=exc.status_code, headers=headers)
    code = _FRAMEWORK_CODES.get(exc.status_code, ErrorCode.GEN_HTTP_ERROR)
    return JSONResponse(
        {'detail': exc.detail, 'code': code.value},
        status_code=exc.status_code,
        headers=headers,
    )


async def _request_validation_handler(request: Request, exc: Exception):
    """Every validation 422: FastAPI's default list, unchanged, plus one
    code for all of them."""
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(
        status_code=422,
        content={
            'detail': jsonable_encoder(exc.errors()),
            'code': ErrorCode.GEN_VALIDATION_FAILED.value,
        },
    )


async def _unhandled_exception_handler(request: Request, exc: Exception):
    """An unhandled error: was Starlette's plain-text 500, now JSON with the
    same words. Starlette's ``ServerErrorMiddleware`` runs this and then
    re-raises, so the error is still logged."""
    return JSONResponse(
        status_code=500,
        content={
            'detail': INTERNAL_SERVER_ERROR,
            'code': ErrorCode.GEN_INTERNAL_ERROR.value,
        },
    )


async def _resource_not_found_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ResourceNotFound)
    return JSONResponse(status_code=404, content=exc.body())


async def _resource_conflict_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ResourceConflict)
    return JSONResponse(status_code=409, content=exc.body())


async def _application_finalized_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ApplicationFinalized)
    return JSONResponse(status_code=409, content=exc.body())


async def _business_rule_violation_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.BusinessRuleViolation)
    return JSONResponse(status_code=422, content=exc.body())


async def _invalid_date_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.InvalidDate)
    return JSONResponse(status_code=422, content=exc.body())


async def _forbidden_access_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ForbiddenAccess)
    return JSONResponse(status_code=403, content=exc.body())


async def _pdf_render_failed_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.PdfRenderFailed)
    return JSONResponse(status_code=500, content=exc.body())


async def _cv_export_failed_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.CVExportFailed)
    return JSONResponse(status_code=500, content=exc.body())


async def _service_unavailable_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ServiceUnavailable)
    return JSONResponse(status_code=503, content=exc.body())


async def _session_service_unavailable_handler(
    request: Request, exc: Exception
):
    # Fail closed (ADR-0019): 503 + Retry-After, never 401 - a 401 would
    # send the web and every CLI to refresh, and a failed refresh signs
    # them out.
    assert isinstance(exc, exceptions.SessionServiceUnavailable)
    return JSONResponse(
        status_code=503,
        content=exc.body(),
        headers={'Retry-After': str(SESSION_RETRY_AFTER_SECONDS)},
    )


async def _invalid_session_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.InvalidSession)
    return JSONResponse(status_code=401, content=exc.body())


async def _invalid_request_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.InvalidRequest)
    return JSONResponse(status_code=400, content=exc.body())


async def _oauth_error_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.OAuthError)
    return JSONResponse(
        status_code=400,
        content={'error': exc.error, **exc.body()},
    )


async def _coded_refusal_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.CodedRefusal)
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.body(),
        headers=exc.headers or None,
    )


def register_handlers(app: FastAPI):
    """Register all errors handlers for the app"""
    app.add_exception_handler(Exception, _unhandled_exception_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(
        RequestValidationError, _request_validation_handler
    )
    app.add_exception_handler(NotImplementedError, _not_implemented_handler)
    app.add_exception_handler(
        exceptions.ResourceNotFound, _resource_not_found_handler
    )
    app.add_exception_handler(
        exceptions.ResourceConflict, _resource_conflict_handler
    )
    app.add_exception_handler(
        exceptions.ApplicationFinalized, _application_finalized_handler
    )
    app.add_exception_handler(
        exceptions.BusinessRuleViolation, _business_rule_violation_handler
    )
    app.add_exception_handler(exceptions.InvalidDate, _invalid_date_handler)
    app.add_exception_handler(
        exceptions.ForbiddenAccess, _forbidden_access_handler
    )
    app.add_exception_handler(
        exceptions.PdfRenderFailed, _pdf_render_failed_handler
    )
    app.add_exception_handler(
        exceptions.CVExportFailed, _cv_export_failed_handler
    )
    app.add_exception_handler(
        exceptions.ServiceUnavailable, _service_unavailable_handler
    )
    # Starlette picks the handler by the exception's MRO, so the subclass
    # wins over ``ServiceUnavailable`` whatever the registration order.
    app.add_exception_handler(
        exceptions.SessionServiceUnavailable,
        _session_service_unavailable_handler,
    )
    app.add_exception_handler(
        exceptions.InvalidSession, _invalid_session_handler
    )
    app.add_exception_handler(exceptions.OAuthError, _oauth_error_handler)
    app.add_exception_handler(
        exceptions.InvalidRequest, _invalid_request_handler
    )
    app.add_exception_handler(exceptions.CodedRefusal, _coded_refusal_handler)
