from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.middleware import register_middleware
from app.config.rate_limit import RateLimitMiddleware
from app.config.settings import envs
from app.presentation.api.admin import routers as admin_routers
from app.presentation.api.application import router as application_router
from app.presentation.api.application_draft import (
    router as application_draft_router,
)
from app.presentation.api.application_step import router as app_step_router
from app.presentation.api.base_cv import router as base_cv_router
from app.presentation.api.borderless_auth import router as borderless_router
from app.presentation.api.cli_auth import router as cli_auth_router
from app.presentation.api.company import router as company_router
from app.presentation.api.cycle import router as cycle_router
from app.presentation.api.github_restore import router as restore_router
from app.presentation.api.job_searches import router as job_search_router
from app.presentation.api.jobs import router as jobs_router
from app.presentation.api.oauth import router as auth_router
from app.presentation.api.platform import router as platform_router
from app.presentation.api.reports import router as reports_router
from app.presentation.api.statistic import router as statistic_router
from app.presentation.api.support import router as support_router
from app.presentation.api.tailored_cv import router as tailored_cv_router
from app.presentation.api.timeline_event import router as timeline_router
from app.presentation.api.user import router as profile_router
from app.presentation.api.user_feedback import router as feedback_router
from app.presentation.api.user_sessions import router as user_sessions_router
from app.presentation.deprecation import (
    DEPRECATION_HEADER,
    DeprecationHeaderMiddleware,
)
from app.presentation.handlers import register_handlers
from app.worker import broker as task_broker


@asynccontextmanager
async def lifespan(_: FastAPI):
    # ADR-0016: the API only produces tasks. Starting the broker client
    # never fails the boot (plan corrections 12).
    await task_broker.start_client()
    yield
    await task_broker.stop_client()


app = FastAPI(
    title='Applika 2.2 API',
    version='2.2.0',
    root_path=envs.API_PREFIX,
    openapi_url=envs.openapi_url,
    lifespan=lifespan,
)


# The rate limiter (KODI-039, ADR-0015) is installed BEFORE (= inside) the
# CORS middleware below, so CORS wraps it: a 429 still carries
# Access-Control-Allow-Origin, and a browser preflight (OPTIONS) is answered
# by CORSMiddleware before this middleware ever counts it.
app.add_middleware(RateLimitMiddleware)  # ty: ignore[invalid-argument-type]
# CORS
app.add_middleware(
    CORSMiddleware,  # ty: ignore[invalid-argument-type]
    allow_origins=envs.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=envs.CORS_METHODS,
    allow_headers=envs.CORS_HEADERS,
    # The API and the web app are separate origins, so the browser cannot
    # read the PDF download's filename unless this header is exposed.
    # ``Deprecation`` is exposed for the same reason: a browser client of a
    # deprecated route can read it (R-020). The rate limiter's headers
    # (KODI-039, ADR-0015) are exposed so the web app can read them and
    # Retry-After across origins (R-019).
    expose_headers=[
        'Content-Disposition',
        DEPRECATION_HEADER,
        'Retry-After',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
    ],
)
# The Deprecation header of the compat routes, on errors too. The ignores:
# ty cannot match a middleware class against Starlette's ParamSpec-based
# ``_MiddlewareFactory`` (CORSMiddleware above hits the same false positive).
app.add_middleware(DeprecationHeaderMiddleware)  # ty: ignore[invalid-argument-type]
# Logging middlewares
register_middleware(app)
# Register exception handlers
register_handlers(app)
# REST Routes
app.include_router(auth_router)
app.include_router(cli_auth_router)
app.include_router(borderless_router)
app.include_router(restore_router)
app.include_router(profile_router)
app.include_router(user_sessions_router)
app.include_router(support_router)
app.include_router(company_router)
app.include_router(platform_router)
app.include_router(application_draft_router)
app.include_router(application_router)
app.include_router(timeline_router)
app.include_router(app_step_router)
app.include_router(statistic_router)
app.include_router(reports_router)
app.include_router(feedback_router)
app.include_router(cycle_router)
app.include_router(base_cv_router)
app.include_router(tailored_cv_router)
app.include_router(jobs_router)
app.include_router(job_search_router)
# REST Admin routes
for _r in admin_routers:
    app.include_router(_r)
