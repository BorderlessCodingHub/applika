from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.middleware import register_middleware
from app.config.settings import envs
from app.presentation.api.application import router as application_router
from app.presentation.api.application_step import router as app_step_router
from app.presentation.api.oauth import router as auth_router
from app.presentation.api.statistic import router as statistic_router
from app.presentation.api.support import router as support_router
from app.presentation.api.user import router as profile_router
from app.presentation.handlers import register_handlers

app = FastAPI(
    title='Application Panel',
    version='0.1.0',
    root_path=envs.API_PREFIX,
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
app.include_router(application_router)
app.include_router(app_step_router)
app.include_router(statistic_router)
