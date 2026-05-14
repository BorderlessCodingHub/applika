from app.core.exceptions import ResourceNotFound
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)


class DeleteResumeUseCase:
    def __init__(self, resume_repo: UserResumeRepository):
        self.resume_repo = resume_repo

    async def execute(self, resume_id: int, user_id: int) -> None:
        resume = await self.resume_repo.get_by_id_and_user(
            resume_id, user_id
        )
        if resume is None:
            raise ResourceNotFound('Resume not found')
        await self.resume_repo.delete(resume)
