"""The jobs one user dismissed (KODI-047, PRD 0012 R-029).

Every read and write is keyed on the acting user's id (ADR-0004): a user
only ever adds or removes their own row, and an admin has no other access.
Both writes are idempotent.
"""

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import JobDismissalModel
from app.lib.types import generate_snowflake_id


class JobDismissalRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def dismiss(self, user_id: int, job_id: int) -> None:
        """Add the caller's dismissal; a second one is a no-op."""
        try:
            await self.session.execute(
                insert(JobDismissalModel)
                .values(
                    id=generate_snowflake_id(),
                    user_id=user_id,
                    job_id=job_id,
                )
                .on_conflict_do_nothing(constraint='uq_job_dismissals_user_job')
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def restore(self, user_id: int, job_id: int) -> None:
        """Remove the caller's dismissal; none is a no-op."""
        try:
            await self.session.execute(
                delete(JobDismissalModel).where(
                    JobDismissalModel.user_id == user_id,
                    JobDismissalModel.job_id == job_id,
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
