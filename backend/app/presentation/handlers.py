from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core import exceptions

# Every handler below is typed ``exc: Exception`` and narrows with an
# ``assert isinstance(...)`` rather than the exact exception subclass.
# Starlette's ``add_exception_handler`` declares its ``handler`` parameter as
# accepting ``(Request, Exception, /) -> ...`` - contravariant in ``exc`` - so
# a handler typed against a narrower subclass is not actually a valid
# ``ExceptionHandler`` by that signature, and ``ty`` flags every one of the
# nine registrations below for it (KODI-017 QA finding B1). The assert keeps
# the handler body reading exactly as it did before - ``exc.message`` still
# resolves against the real subclass - while making the file ``ty``-clean,
# per quality-gates.md's "files a slice creates or changes must be clean".


async def _not_implemented_handler(request: Request, exc: Exception):
    msg = 'This endpoint has been defined but not yet implemented'
    return JSONResponse(status_code=501, content={'detail': msg})


async def _resource_not_found_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ResourceNotFound)
    return JSONResponse(status_code=404, content={'detail': exc.message})


async def _resource_conflict_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ResourceConflict)
    return JSONResponse(status_code=409, content={'detail': exc.message})


async def _application_finalized_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ApplicationFinalized)
    return JSONResponse(status_code=409, content={'detail': exc.message})


async def _business_rule_violation_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.BusinessRuleViolation)
    return JSONResponse(status_code=422, content={'detail': exc.message})


async def _invalid_date_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.InvalidDate)
    return JSONResponse(status_code=422, content={'detail': exc.message})


async def _forbidden_access_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.ForbiddenAccess)
    return JSONResponse(status_code=403, content={'detail': exc.message})


async def _pdf_render_failed_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.PdfRenderFailed)
    return JSONResponse(status_code=500, content={'detail': exc.message})


async def _cv_export_failed_handler(request: Request, exc: Exception):
    assert isinstance(exc, exceptions.CVExportFailed)
    return JSONResponse(status_code=500, content={'detail': exc.message})


def register_handlers(app: FastAPI):
    """Register all errors handlers for the app"""
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
