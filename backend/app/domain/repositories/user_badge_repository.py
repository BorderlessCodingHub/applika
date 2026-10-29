"""Membership badges with history (ADR-0024).

``apply`` is the one writer: it revokes every other live badge and inserts
the given one when it is not live yet. Revoking sets ``revoked_at`` and
keeps the row.
"""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BadgeKey, BadgeSource
from app.domain.models import UserBadgeModel


class UserBadgeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def live_for_user(self, user_id: int) -> list[UserBadgeModel]:
        result = await self.session.scalars(
            select(UserBadgeModel)
            .where(
                UserBadgeModel.user_id == user_id,
                UserBadgeModel.revoked_at.is_(None),
            )
            .order_by(UserBadgeModel.granted_at)
        )
        return list(result)

    async def apply(
        self, user_id: int, badge: BadgeKey | None, commit: bool = True
    ) -> None:
        now = datetime.now(UTC)
        live = await self.live_for_user(user_id)
        for row in live:
            if badge is None or row.badge != badge.value:
                row.revoked_at = now
                row.updated_at = now
        if badge is not None and all(row.badge != badge.value for row in live):
            self.session.add(
                UserBadgeModel(
                    user_id=user_id,
                    badge=badge.value,
                    source=BadgeSource.BORDERLESS.value,
                    granted_at=now,
                )
            )
        try:
            if commit:
                await self.session.commit()
            else:
                await self.session.flush()
        except Exception:
            await self.session.rollback()
            raise

    async def move_all(
        self, from_user_id: int, to_user_id: int, commit: bool = True
    ) -> None:
        """Every row, live and revoked, moves with the binding."""
        await self.session.execute(
            update(UserBadgeModel)
            .where(UserBadgeModel.user_id == from_user_id)
            .values(user_id=to_user_id, updated_at=datetime.now(UTC))
        )
        try:
            if commit:
                await self.session.commit()
            else:
                await self.session.flush()
        except Exception:
            await self.session.rollback()
            raise
