"""Device session rows (KODI-057, ADR-0019): one row per sign-in, kept after
it ends. Owner-scoped reads (ADR-0004); no refresh value ever reaches this
table."""

from datetime import datetime

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import UserSessionModel


class UserSessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: int,
        client_type: str,
        sign_in_method: str,
        device_name: str,
        user_agent: str | None,
        ip: str | None,
        expires_at: datetime,
    ) -> UserSessionModel:
        row = UserSessionModel(
            user_id=user_id,
            client_type=client_type,
            sign_in_method=sign_in_method,
            device_name=device_name,
            user_agent=user_agent,
            created_ip=ip,
            last_ip=ip,
            expires_at=expires_at,
        )
        self.session.add(row)
        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(row)
        return row

    async def delete(self, session_id: int) -> None:
        """Remove a row whose session never went live (its Redis keys could
        not be written), so no phantom device is listed."""
        try:
            await self.session.execute(
                delete(UserSessionModel).where(
                    UserSessionModel.id == session_id
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def get(self, session_id: int) -> UserSessionModel | None:
        return await self.session.get(UserSessionModel, session_id)

    async def get_own(
        self, session_id: int, user_id: int
    ) -> UserSessionModel | None:
        return await self.session.scalar(
            select(UserSessionModel).where(
                UserSessionModel.id == session_id,
                UserSessionModel.user_id == user_id,
            )
        )

    async def list_for_user(
        self, user_id: int, since: datetime
    ) -> list[UserSessionModel]:
        """Every open row, plus every row that ended at or after ``since``.
        An open row whose session has lapsed is filtered by the caller,
        which knows what Redis says."""
        result = await self.session.scalars(
            select(UserSessionModel).where(
                UserSessionModel.user_id == user_id,
                or_(
                    UserSessionModel.ended_at.is_(None),
                    UserSessionModel.ended_at >= since,
                ),
            )
        )
        return list(result.all())

    async def list_open(self, user_id: int) -> list[UserSessionModel]:
        result = await self.session.scalars(
            select(UserSessionModel).where(
                UserSessionModel.user_id == user_id,
                UserSessionModel.ended_at.is_(None),
            )
        )
        return list(result.all())

    async def set_expiry(
        self,
        session_id: int,
        expires_at: datetime,
        last_used_at: datetime | None,
        last_ip: str | None,
    ) -> None:
        """Slide an open row's end and copy the live last use onto it."""
        values: dict[str, object] = {'expires_at': expires_at}
        if last_used_at is not None:
            values['last_used_at'] = last_used_at
        if last_ip is not None:
            values['last_ip'] = last_ip
        await self._update_open(session_id, values)

    async def end(
        self,
        session_id: int,
        reason: str,
        at: datetime,
        last_used_at: datetime | None,
        last_ip: str | None,
    ) -> bool:
        """End an open row. False when it had already ended."""
        values: dict[str, object] = {'ended_at': at, 'end_reason': reason}
        if last_used_at is not None:
            values['last_used_at'] = last_used_at
        if last_ip is not None:
            values['last_ip'] = last_ip
        return await self._update_open(session_id, values)

    async def _update_open(
        self, session_id: int, values: dict[str, object]
    ) -> bool:
        try:
            result = await self.session.execute(
                update(UserSessionModel)
                .where(
                    UserSessionModel.id == session_id,
                    UserSessionModel.ended_at.is_(None),
                )
                .values(**values)
                .execution_options(synchronize_session=False)
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return bool(getattr(result, 'rowcount', 0))
