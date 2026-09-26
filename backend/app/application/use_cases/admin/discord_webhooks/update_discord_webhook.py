from app.application.dto.discord import DiscordReportWebhookDTO
from app.application.validators.discord_webhook import (
    validate_guild_id,
    validate_label,
    validate_role_ids,
    validate_webhook_url,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)

NOT_FOUND = 'Discord webhook not found'


class UpdateDiscordWebhookUseCase:
    """T118: partial update.

    ``fields`` is the request body's ``model_dump(exclude_unset=True)`` -
    only keys the caller actually sent. A blank/whitespace-only
    ``webhook_url`` (present but empty) keeps the stored one, same as
    omitting the key; any other value is re-validated exactly as on create
    and a duplicate still raises the fixed ``ResourceConflict`` at the
    repository. ``role_ids`` fully replaces the stored list whenever the key
    is present (including an empty list). ``label: null`` clears it -
    that is the one field where "present" and "absent" differ, so it is
    checked via key membership, not truthiness.
    """

    def __init__(self, webhook_repo: DiscordReportWebhookRepository):
        self.webhook_repo = webhook_repo

    async def execute(
        self,
        webhook_id: int,
        fields: dict,
        admin_id: int,
    ) -> DiscordReportWebhookDTO:
        webhook = await self.webhook_repo.get_by_id(webhook_id)
        if webhook is None:
            logger.warning(
                f'Admin update Discord webhook failed: {webhook_id}',
                extra={
                    'extra_data': {
                        'event': 'admin_update_discord_webhook_failed',
                        'reason': 'discord_webhook_not_found',
                        'discord_webhook_id': webhook_id,
                        'admin_id': admin_id,
                    }
                },
            )
            raise ResourceNotFound(NOT_FOUND)

        if 'webhook_url' in fields:
            raw_url = fields['webhook_url']
            if raw_url is not None and raw_url.strip():
                webhook.webhook_url = validate_webhook_url(raw_url)

        if 'guild_id' in fields:
            raw_guild_id = fields['guild_id']
            if raw_guild_id is not None and str(raw_guild_id).strip():
                webhook.guild_id = validate_guild_id(raw_guild_id)

        if 'role_ids' in fields:
            webhook.role_ids = validate_role_ids(fields['role_ids'])

        if 'label' in fields:
            webhook.label = validate_label(fields['label'])

        webhook = await self.webhook_repo.update(webhook)

        logger.info(
            f'Admin updated Discord report webhook: {webhook_id}',
            extra={
                'extra_data': {
                    'event': 'admin_update_discord_webhook',
                    'discord_webhook_id': webhook_id,
                    'admin_id': admin_id,
                    'fields_updated': list(fields.keys()),
                }
            },
        )

        return DiscordReportWebhookDTO.model_validate(webhook)
