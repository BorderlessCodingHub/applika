"""Admin report webhook repository (ADR-0024).

A webhook and its badges (``report_webhook_badges``) are written in one
commit; a new set of badges replaces the old one.

The unique-URL ``IntegrityError`` (asyncpg puts the offending value in its
``DETAIL``) is turned into a fixed-string ``ResourceConflict``, never
``str(err)``, which would leak the webhook URL into a log or a response.
"""

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict
from app.domain.models import ReportWebhookBadgeModel, ReportWebhookModel

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
        """The webhooks holding any of ``badges``, each once, oldest first.
        A webhook with no badge is never returned."""
        if not badges:
            return []
        holding = select(ReportWebhookBadgeModel.report_webhook_id).where(
            ReportWebhookBadgeModel.badge.in_(badges)
        )
        result = await self.session.scalars(
            select(ReportWebhookModel)
            .where(ReportWebhookModel.id.in_(holding))
            .order_by(ReportWebhookModel.created_at, ReportWebhookModel.id)
        )
        return list(result)

    async def _reload(self, webhook: ReportWebhookModel) -> None:
        await self.session.refresh(webhook)
        await self.session.refresh(webhook, ['badge_links'])

    async def create(
        self, *, url: str, label: str | None, badges: list[str]
    ) -> ReportWebhookModel:
        try:
            webhook = ReportWebhookModel(
                url=url,
                label=label,
                badge_links=[
                    ReportWebhookBadgeModel(badge=badge) for badge in badges
                ],
            )
            self.session.add(webhook)
            await self.session.commit()
            await self._reload(webhook)
            return webhook
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(
                ALREADY_CONFIGURED, ErrorCode.ADM_WEBHOOK_ALREADY_CONFIGURED
            ) from err
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, webhook: ReportWebhookModel, badges: list[str] | None = None
    ) -> ReportWebhookModel:
        """Save ``webhook``; ``badges``, when given, replaces its set (rows
        kept for the badges it keeps, the others deleted, new ones added)."""
        try:
            if badges is not None:
                kept = [
                    link for link in webhook.badge_links if link.badge in badges
                ]
                held = {link.badge for link in kept}
                webhook.badge_links = kept + [
                    ReportWebhookBadgeModel(badge=badge)
                    for badge in badges
                    if badge not in held
                ]
            webhook.updated_at = datetime.now(UTC)
            self.session.add(webhook)
            await self.session.commit()
            await self._reload(webhook)
            return webhook
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(
                ALREADY_CONFIGURED, ErrorCode.ADM_WEBHOOK_ALREADY_CONFIGURED
            ) from err
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
