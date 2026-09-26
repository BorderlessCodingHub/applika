"""Admin report webhook routes (KODI-025, ADR-0013, T117).

All behind ``AdminUserDp`` - a non-admin gets 403 exactly as every other
``/admin`` route does. K8 (out of scope here) is the only other reader,
through ``DiscordReportWebhookRepository.list_by_guild_ids``.
"""

from fastapi import APIRouter, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

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


class _NoInputEchoRoute(APIRoute):
    """A ``RequestValidationError`` on this router never echoes ``input``
    (T116/AC3, backend-qa finding B3).

    FastAPI's default 422 handler echoes the value that failed validation
    for every error, and for a *missing* field that value is pydantic's
    ``input`` for the whole enclosing model - i.e. the whole submitted
    body, ``webhook_url`` included. The default handler also echoes
    whatever the caller actually sent for a type-mismatch error (a list,
    a form-encoded body, a bare JSON string), any of which could carry the
    webhook URL or its token segment. This route class strips ``input``
    from every error on this router **only** - the global handler and
    every other route's 422 shape (installed ``applika-cli`` versions
    included) are untouched.
    """

    def get_route_handler(self):
        original_route_handler = super().get_route_handler()

        async def custom_route_handler(request: Request) -> Response:
            try:
                return await original_route_handler(request)
            except RequestValidationError as exc:
                errors = [
                    {
                        key: value
                        for key, value in error.items()
                        if key != 'input'
                    }
                    for error in exc.errors()
                ]
                for error in errors:
                    if 'loc' in error:
                        error['loc'] = list(error['loc'])
                return JSONResponse(status_code=422, content={'detail': errors})

        return custom_route_handler


router = APIRouter(
    prefix='/admin',
    tags=['Admin - Discord webhooks'],
    responses={'403': {'model': DetailSchema}},
    route_class=_NoInputEchoRoute,
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
