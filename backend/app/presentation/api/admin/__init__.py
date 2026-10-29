from app.presentation.api.admin.companies import router as companies_router
from app.presentation.api.admin.features import router as features_router
from app.presentation.api.admin.jobs import router as jobs_router
from app.presentation.api.admin.platforms import router as platforms_router
from app.presentation.api.admin.report_webhooks import (
    router as report_webhooks_router,
)
from app.presentation.api.admin.stats import router as stats_router
from app.presentation.api.admin.users import router as users_router

# The step and feedback definition catalog routes were removed (R-021): the
# catalogs are frozen and nobody may change them. /admin/step-definitions*
# and /admin/feedback-definitions* now answer 404. /admin/discord-webhooks*
# is gone too (ADR-0024): /admin/report-webhooks replaces it.
routers = [
    stats_router,
    users_router,
    companies_router,
    platforms_router,
    report_webhooks_router,
    jobs_router,
    features_router,
]
