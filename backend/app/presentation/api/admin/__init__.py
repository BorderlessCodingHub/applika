from app.presentation.api.admin.companies import router as companies_router
from app.presentation.api.admin.feedback_definitions import (
    router as feedback_definitions_router,
)
from app.presentation.api.admin.jobs import router as admin_jobs_router
from app.presentation.api.admin.platforms import router as platforms_router
from app.presentation.api.admin.stats import router as stats_router
from app.presentation.api.admin.step_definitions import (
    router as step_definitions_router,
)
from app.presentation.api.admin.users import router as users_router

routers = [
    stats_router,
    users_router,
    companies_router,
    platforms_router,
    step_definitions_router,
    feedback_definitions_router,
    admin_jobs_router,
]
