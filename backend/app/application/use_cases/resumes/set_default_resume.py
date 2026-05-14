from app.application.dto.resumes import UserResumeDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)


class SetDefaultResumeUseCase:
    def __init__(self, resume_repo: UserResumeRepository):
        self.resume_repo = resume_repo

    async def execute(self, resume_id: int, user_id: int) -> UserResumeDTO:
        resume = await self.resume_repo.get_by_id_and_user(
            resume_id, user_id
        )
        if resume is None:
            raise ResourceNotFound('Resume not found')
        await self.resume_repo.set_default(resume_id, user_id)
        resume.is_default = True
        return UserResumeDTO.model_validate(resume)
