from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.middleware import register_middleware
from app.config.settings import envs
from app.presentation.api.account_link import router as account_link_router
from app.presentation.api.admin import routers as admin_routers
from app.presentation.api.application import router as application_router
from app.presentation.api.application_step import router as app_step_router
from app.presentation.api.base_cv import router as base_cv_router
from app.presentation.api.company import router as company_router
from app.presentation.api.cycle import router as cycle_router
from app.presentation.api.oauth import router as auth_router
from app.presentation.api.platform import router as platform_router
from app.presentation.api.reports import router as reports_router
from app.presentation.api.statistic import router as statistic_router
from app.presentation.api.support import router as support_router
from app.presentation.api.tailored_cv import router as tailored_cv_router
from app.presentation.api.timeline_event import router as timeline_router
from app.presentation.api.user import router as profile_router
from app.presentation.api.user_feedback import router as feedback_router
from app.presentation.deprecation import (
    DEPRECATION_HEADER,
    DeprecationHeaderMiddleware,
)
from app.presentation.handlers import register_handlers

app = FastAPI(
    title='Applika 2.2 API',
    version='2.2.0',
    root_path=envs.API_PREFIX,
    openapi_url=envs.openapi_url,
)


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
    # deprecated route can read it (R-020).
    expose_headers=['Content-Disposition', DEPRECATION_HEADER],
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
app.include_router(account_link_router)
app.include_router(profile_router)
app.include_router(support_router)
app.include_router(company_router)
app.include_router(platform_router)
app.include_router(application_router)
app.include_router(timeline_router)
app.include_router(app_step_router)
app.include_router(statistic_router)
app.include_router(reports_router)
app.include_router(feedback_router)
app.include_router(cycle_router)
app.include_router(base_cv_router)
app.include_router(tailored_cv_router)
# REST Admin routes
for _r in admin_routers:
    app.include_router(_r)
