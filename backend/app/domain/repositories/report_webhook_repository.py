"""Admin report webhook repository (ADR-0024).

The unique-URL ``IntegrityError`` (asyncpg puts the offending value in its
``DETAIL``) is turned into a fixed-string ``ResourceConflict``, never
``str(err)``, which would leak the webhook URL into a log or a response.
"""

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflict
from app.domain.models import ReportWebhookModel

ALREADY_CONFIGURED = 'This webhook is already configured'


class ReportWebhookRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self) -> list[ReportWebhookModel]:
        result = await self.session.scalars(
            select(ReportWebhookModel).order_by(ReportWebhookModel.id)
        )
        return list(result)

    async def get_by_id(self, id: int) -> ReportWebhookModel | None:
        return await self.session.scalar(
            select(ReportWebhookModel).where(ReportWebhookModel.id == id)
        )

    async def list_by_badges(
        self, badges: list[str]
    ) -> list[ReportWebhookModel]:
        """The webhooks assigned to any of ``badges``, oldest first. A
        webhook with no badge is never returned."""
        if not badges:
            return []
        result = await self.session.scalars(
            select(ReportWebhookModel)
            .where(ReportWebhookModel.badge.in_(badges))
            .order_by(ReportWebhookModel.created_at, ReportWebhookModel.id)
        )
        return list(result)

    async def create(self, **kwargs) -> ReportWebhookModel:
        try:
            webhook = ReportWebhookModel(**kwargs)
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

    async def update(self, webhook: ReportWebhookModel) -> ReportWebhookModel:
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
                delete(ReportWebhookModel).where(ReportWebhookModel.id == id)
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
