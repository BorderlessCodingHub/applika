"""Admin report webhook repository (KODI-025, ADR-0013, T114).

The unique-URL ``IntegrityError`` (asyncpg puts the offending value in its
``DETAIL``) is caught here and turned into a fixed-string ``ResourceConflict``
- the same discipline ``DiscordConnectionRepository`` uses for
``uq_discord_connections_discord_id`` - never ``str(err)``, which would leak
the webhook URL into a log or a response (R-030).
"""

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflict
from app.domain.models import DiscordReportWebhookModel

ALREADY_CONFIGURED = 'This webhook is already configured'


class DiscordReportWebhookRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self) -> list[DiscordReportWebhookModel]:
        result = await self.session.scalars(
            select(DiscordReportWebhookModel).order_by(
                DiscordReportWebhookModel.id
            )
        )
        return list(result)

    async def get_by_id(self, id: int) -> DiscordReportWebhookModel | None:
        return await self.session.scalar(
            select(DiscordReportWebhookModel).where(
                DiscordReportWebhookModel.id == id
            )
        )

    async def list_by_guild_ids(
        self, guild_ids: list[int]
    ) -> list[DiscordReportWebhookModel]:
        """K8's submit-time lookup: the webhooks of a set of servers."""
        if not guild_ids:
            return []
        result = await self.session.scalars(
            select(DiscordReportWebhookModel).where(
                DiscordReportWebhookModel.guild_id.in_(guild_ids)
            )
        )
        return list(result)

    async def create(self, **kwargs) -> DiscordReportWebhookModel:
        try:
            webhook = DiscordReportWebhookModel(**kwargs)
            self.session.add(webhook)
            await self.session.commit()
            await self.session.refresh(webhook)
            return webhook
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(ALREADY_CONFIGURED) from err
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, webhook: DiscordReportWebhookModel
    ) -> DiscordReportWebhookModel:
        try:
            webhook.updated_at = datetime.now(UTC)
            self.session.add(webhook)
            await self.session.commit()
            await self.session.refresh(webhook)
            return webhook
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(ALREADY_CONFIGURED) from err
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, id: int) -> None:
        try:
            await self.session.execute(
                delete(DiscordReportWebhookModel).where(
                    DiscordReportWebhookModel.id == id
                )
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
