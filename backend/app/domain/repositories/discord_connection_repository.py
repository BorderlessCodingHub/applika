"""Discord connection repository (KODI-024, ADR-0013).

The conflict/no-op rules that used to live on ``UserRepository.link_discord``
move here, now scoped to the connection row instead of a ``users`` column:
another user holding the Discord id is a pre-checked ``ResourceConflict``,
and a race lost to an ``IntegrityError`` on ``uq_discord_connections_discord_id``
is mapped to the same conflict.
"""

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DiscordConnectionStatus
from app.core.exceptions import ResourceConflict
from app.domain.models import DiscordConnectionModel

DISCORD_ALREADY_LINKED = (
    'This Discord account is linked to another Applika account'
)


class DiscordConnectionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_user_id(
        self, user_id: int
    ) -> DiscordConnectionModel | None:
        return await self.session.scalar(
            select(DiscordConnectionModel).where(
                DiscordConnectionModel.user_id == user_id
            )
        )

    async def get_by_user_id_for_update(
        self, user_id: int
    ) -> DiscordConnectionModel | None:
        return await self.session.scalar(
            select(DiscordConnectionModel)
            .where(DiscordConnectionModel.user_id == user_id)
            .with_for_update()
        )

    async def get_by_discord_id(
        self, discord_id: int
    ) -> DiscordConnectionModel | None:
        return await self.session.scalar(
            select(DiscordConnectionModel).where(
                DiscordConnectionModel.discord_id == discord_id
            )
        )

    async def link(
        self,
        user_id: int,
        discord_id: int,
        username: str,
        global_name: str | None,
        avatar: str | None,
        scopes: str,
        encrypted_refresh_token: str,
        access_token_expires_at: datetime | None,
    ) -> DiscordConnectionModel:
        """Connect or reconnect (T095/T103).

        Another user already holding ``discord_id`` is a pre-checked
        ``ResourceConflict``; a race lost to the database's own
        ``uq_discord_connections_discord_id`` is caught as an
        ``IntegrityError`` and mapped to the same conflict. The caller's own
        row - present or absent - is written in place: a fresh connect
        inserts, a reconnect (same account or a different one while
        ``needs_reconnect``) refreshes every field and clears the mark.
        """
        owner = await self.get_by_discord_id(discord_id)
        if owner is not None and owner.user_id != user_id:
            raise ResourceConflict(DISCORD_ALREADY_LINKED)

        try:
            connection = await self.get_by_user_id(user_id)
            now = datetime.now(timezone.utc)
            if connection is None:
                connection = DiscordConnectionModel(
                    user_id=user_id,
                    discord_id=discord_id,
                    username=username,
                    global_name=global_name,
                    avatar=avatar,
                    scopes=scopes,
                    encrypted_refresh_token=encrypted_refresh_token,
                    access_token_expires_at=access_token_expires_at,
                    status=DiscordConnectionStatus.ACTIVE,
                    linked_at=now,
                )
            else:
                connection.discord_id = discord_id
                connection.username = username
                connection.global_name = global_name
                connection.avatar = avatar
                connection.scopes = scopes
                connection.encrypted_refresh_token = encrypted_refresh_token
                connection.access_token_expires_at = access_token_expires_at
                connection.status = DiscordConnectionStatus.ACTIVE
                connection.linked_at = now

            self.session.add(connection)
            await self.session.commit()
            await self.session.refresh(connection)
            return connection
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(DISCORD_ALREADY_LINKED) from err
        except Exception as e:
            await self.session.rollback()
            raise e

    async def store_grant(
        self,
        user_id: int,
        encrypted_refresh_token: str,
        access_token_expires_at: datetime | None,
        scopes: str,
    ) -> DiscordConnectionModel | None:
        """Persist a renewed refresh token (T103/T17, R-017's K6 share).

        Called at each successful ``refresh()``. Returns ``None`` when the
        user holds no connection - nothing to renew.
        """
        connection = await self.get_by_user_id(user_id)
        if connection is None:
            return None

        try:
            connection.encrypted_refresh_token = encrypted_refresh_token
            connection.access_token_expires_at = access_token_expires_at
            connection.scopes = scopes
            self.session.add(connection)
            await self.session.commit()
            await self.session.refresh(connection)
            return connection
        except Exception as e:
            await self.session.rollback()
            raise e

    async def mark_needs_reconnect(self, user_id: int) -> None:
        connection = await self.get_by_user_id(user_id)
        if connection is None:
            return
        try:
            connection.status = DiscordConnectionStatus.NEEDS_RECONNECT
            self.session.add(connection)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete_by_user_id(self, user_id: int) -> None:
        """Idempotent: deleting an absent row is a no-op."""
        try:
            await self.session.execute(
                delete(DiscordConnectionModel).where(
                    DiscordConnectionModel.user_id == user_id
                )
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
