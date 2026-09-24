"""Admin report webhook routes (KODI-025, ADR-0013, T117).

All behind ``AdminUserDp`` - a non-admin gets 403 exactly as every other
``/admin`` route does. K8 (out of scope here) is the only other reader,
through ``DiscordReportWebhookRepository.list_by_guild_ids``.
"""

from fastapi import APIRouter

from app.application.use_cases.admin.discord_webhooks.create_discord_webhook import (
    CreateDiscordWebhookUseCase,
)
from app.application.use_cases.admin.discord_webhooks.delete_discord_webhook import (
    DeleteDiscordWebhookUseCase,
)
from app.application.use_cases.admin.discord_webhooks.list_discord_webhooks import (
    ListDiscordWebhooksUseCase,
)
from app.application.use_cases.admin.discord_webhooks.update_discord_webhook import (
    UpdateDiscordWebhookUseCase,
)
from app.presentation.dependencies import (
    AdminUserDp,
    DiscordReportWebhookRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.discord_webhook import (
    CreateDiscordWebhookSchema,
    DiscordReportWebhookSchema,
    UpdateDiscordWebhookSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Discord webhooks'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/discord-webhooks',
    response_model=list[DiscordReportWebhookSchema],
)
async def list_admin_discord_webhooks(
    admin: AdminUserDp,
    webhook_repo: DiscordReportWebhookRepositoryDp,
):
    use_case = ListDiscordWebhooksUseCase(webhook_repo)
    dtos = await use_case.execute(admin.id)
    return [DiscordReportWebhookSchema.from_dto(d) for d in dtos]


@router.post(
    '/discord-webhooks',
    response_model=DiscordReportWebhookSchema,
    status_code=201,
)
async def create_admin_discord_webhook(
    body: CreateDiscordWebhookSchema,
    admin: AdminUserDp,
    webhook_repo: DiscordReportWebhookRepositoryDp,
):
    use_case = CreateDiscordWebhookUseCase(webhook_repo)
    dto = await use_case.execute(
        webhook_url=body.webhook_url,
        guild_id=body.guild_id,
        role_ids=body.role_ids,
        label=body.label,
        admin_id=admin.id,
    )
    return DiscordReportWebhookSchema.from_dto(dto)


@router.patch(
    '/discord-webhooks/{webhook_id}',
    response_model=DiscordReportWebhookSchema,
)
async def update_admin_discord_webhook(
    webhook_id: int,
    body: UpdateDiscordWebhookSchema,
    admin: AdminUserDp,
    webhook_repo: DiscordReportWebhookRepositoryDp,
):
    use_case = UpdateDiscordWebhookUseCase(webhook_repo)
    fields = body.model_dump(exclude_unset=True)
    dto = await use_case.execute(webhook_id, fields, admin.id)
    return DiscordReportWebhookSchema.from_dto(dto)


@router.delete('/discord-webhooks/{webhook_id}', status_code=204)
async def delete_admin_discord_webhook(
    webhook_id: int,
    admin: AdminUserDp,
    webhook_repo: DiscordReportWebhookRepositoryDp,
):
    use_case = DeleteDiscordWebhookUseCase(webhook_repo)
    await use_case.execute(webhook_id, admin.id)
