from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core import exceptions


async def _not_implemented_handler(
    request: Request, exc: exceptions.ResourceNotFound
):
    msg = 'This endpoint has been defined but not yet implemented'
    return JSONResponse(status_code=501, content={'detail': msg})


async def _resource_not_found_handler(
    request: Request, exc: exceptions.ResourceNotFound
):
    return JSONResponse(status_code=404, content={'detail': exc.message})


async def _resource_conflict_handler(
    request: Request, exc: exceptions.ResourceConflict
):
    return JSONResponse(status_code=409, content={'detail': exc.message})


async def _application_finalized_handler(
    request: Request, exc: exceptions.ApplicationFinalized
):
    return JSONResponse(status_code=409, content={'detail': exc.message})


async def _business_rule_violation_handler(
    request: Request, exc: exceptions.BusinessRuleViolation
):
    return JSONResponse(status_code=422, content={'detail': exc.message})


async def _invalid_date_handler(
    request: Request, exc: exceptions.InvalidDate
):
    return JSONResponse(status_code=422, content={'detail': exc.message})


async def _forbidden_access_handler(
    request: Request, exc: exceptions.ForbiddenAccess
):
    return JSONResponse(status_code=403, content={'detail': exc.message})


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
