"""Finish a GitHub restore (ADR-0024).

GitHub's identity is used once to find the GitHub-era account. The
Borderless binding and the badges move to that old account, the empty new
account is deleted and the caller's sessions end, all in one transaction.
Nothing from GitHub is stored.
"""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.session_store import SessionStore
from app.config.logging import logger
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.github_connection_repository import (
    GithubConnectionRepository,
)
from app.domain.repositories.user_badge_repository import UserBadgeRepository
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)

RestoreStatus = Literal['restored', 'not_found', 'has_data', 'already_bound']


@dataclass(frozen=True)
class RestoreResult:
    status: RestoreStatus
    user_id: int | None = None


class CompleteGithubRestoreUseCase:
    def __init__(self, session: AsyncSession, store: SessionStore):
        self.session = session
        self.store = store
        self.users = UserRepository(session)
        self.connections = GithubConnectionRepository(session)
        self.bindings = BorderlessAccountRepository(session)
        self.badges = UserBadgeRepository(session)
        self.sessions = UserSessionRepository(session)

    async def execute(self, caller_id: int, github_id: int) -> RestoreResult:
        connection = await self.connections.find_by_github_id(github_id)
        if connection is None or connection.user_id == caller_id:
            return RestoreResult('not_found')
        old_user_id = connection.user_id
        if await self.bindings.get_by_user_id(old_user_id) is not None:
            return RestoreResult('already_bound')
        if await self.users.holds_data(caller_id):
            return RestoreResult('has_data')
        caller = await self.users.get_by_id(caller_id)
        if caller is None:
            return RestoreResult('not_found')

        try:
            await self.bindings.move_to_user(
                caller_id, old_user_id, commit=False
            )
            await self.badges.move_all(caller_id, old_user_id, commit=False)
            for row in await self.sessions.list_open(caller_id):
                await self.store.end(row.id)
            await self.users.delete(caller, commit=False)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        logger.info(
            f'GitHub restore moved user {caller_id} into user {old_user_id}'
        )
        return RestoreResult('restored', old_user_id)
