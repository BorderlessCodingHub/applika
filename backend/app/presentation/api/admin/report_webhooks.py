"""Admin report webhook routes (ADR-0024).

All behind ``AdminUserDp``. Each webhook holds an address, a badge (BASE
or PSP) and an optional label; a report goes to the webhooks of the badges
its author holds. Responses carry only a masked address, and a 422 on this
router never echoes the submitted input.
"""

from fastapi import APIRouter

from app.application.use_cases.admin.report_webhooks.create_report_webhook import (
    CreateReportWebhookUseCase,
)
from app.application.use_cases.admin.report_webhooks.delete_report_webhook import (
    DeleteReportWebhookUseCase,
)
from app.application.use_cases.admin.report_webhooks.list_report_webhooks import (
    ListReportWebhooksUseCase,
)
from app.application.use_cases.admin.report_webhooks.update_report_webhook import (
    UpdateReportWebhookUseCase,
)
from app.presentation.dependencies import (
    AdminUserDp,
    ReportWebhookRepositoryDp,
)
from app.presentation.no_input_echo import NoInputEchoRoute
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.report_webhook import (
    CreateReportWebhookSchema,
    ReportWebhookSchema,
    UpdateReportWebhookSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Report webhooks'],
    responses={'403': {'model': DetailSchema}},
    route_class=NoInputEchoRoute,
)


@router.get('/report-webhooks', response_model=list[ReportWebhookSchema])
async def list_admin_report_webhooks(
    _admin: AdminUserDp, webhook_repo: ReportWebhookRepositoryDp
):
    dtos = await ListReportWebhooksUseCase(webhook_repo).execute()
    return [ReportWebhookSchema.from_dto(dto) for dto in dtos]


@router.post(
    '/report-webhooks',
    response_model=ReportWebhookSchema,
    status_code=201,
    responses={'409': {'model': DetailSchema}},
)
async def create_admin_report_webhook(
    body: CreateReportWebhookSchema,
    admin: AdminUserDp,
    webhook_repo: ReportWebhookRepositoryDp,
):
    dto = await CreateReportWebhookUseCase(webhook_repo).execute(
        webhook_url=body.webhook_url,
        badge=body.badge,
        label=body.label,
        admin_id=admin.id,
    )
    return ReportWebhookSchema.from_dto(dto)


@router.patch(
    '/report-webhooks/{webhook_id}',
    response_model=ReportWebhookSchema,
    responses={'404': {'model': DetailSchema}, '409': {'model': DetailSchema}},
)
async def update_admin_report_webhook(
    webhook_id: int,
    body: UpdateReportWebhookSchema,
    admin: AdminUserDp,
    webhook_repo: ReportWebhookRepositoryDp,
):
    dto = await UpdateReportWebhookUseCase(webhook_repo).execute(
        webhook_id, body.model_dump(exclude_unset=True), admin.id
    )
    return ReportWebhookSchema.from_dto(dto)


@router.delete(
    '/report-webhooks/{webhook_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_admin_report_webhook(
    webhook_id: int,
    admin: AdminUserDp,
    webhook_repo: ReportWebhookRepositoryDp,
):
    await DeleteReportWebhookUseCase(webhook_repo).execute(webhook_id, admin.id)
