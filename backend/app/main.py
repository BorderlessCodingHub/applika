from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.middleware import register_middleware
from app.config.settings import envs
from app.presentation.api.admin import routers as admin_routers
from app.presentation.api.application import router as application_router
from app.presentation.api.application_step import router as app_step_router
from app.presentation.api.company import router as company_router
from app.presentation.api.cycle import router as cycle_router
from app.presentation.api.oauth import router as auth_router
from app.presentation.api.reports import router as reports_router
from app.presentation.api.statistic import router as statistic_router
from app.presentation.api.support import router as support_router
from app.presentation.api.user import router as profile_router
from app.presentation.api.user_feedback import router as feedback_router
from app.presentation.handlers import register_handlers

app = FastAPI(
    title='Applika 2.2 API',
    version='2.2.0',
    root_path=envs.API_PREFIX,
    openapi_url=envs.openapi_url,
)


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=envs.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=envs.CORS_METHODS,
    allow_headers=envs.CORS_HEADERS,
)
# Logging middlewares
register_middleware(app)
# Register exception handlers
register_handlers(app)
# REST Routes
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(support_router)
app.include_router(company_router)
app.include_router(application_router)
app.include_router(app_step_router)
app.include_router(statistic_router)
app.include_router(reports_router)
app.include_router(feedback_router)
app.include_router(cycle_router)
# REST Admin routes
for _r in admin_routers:
    app.include_router(_r)
