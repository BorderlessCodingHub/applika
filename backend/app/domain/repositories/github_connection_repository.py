"""GitHub-era identities, read only by the GitHub restore (ADR-0024)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import GithubConnectionModel


class GithubConnectionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def find_by_github_id(
        self, github_id: int
    ) -> GithubConnectionModel | None:
        return await self.session.scalar(
            select(GithubConnectionModel).where(
                GithubConnectionModel.github_id == github_id
            )
        )

    async def get_by_user_id(
        self, user_id: int
    ) -> GithubConnectionModel | None:
        return await self.session.scalar(
            select(GithubConnectionModel).where(
                GithubConnectionModel.user_id == user_id
            )
        )
