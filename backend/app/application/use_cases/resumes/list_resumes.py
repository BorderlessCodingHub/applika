from app.application.dto.resumes import UserResumeDTO
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)


class ListResumesUseCase:
    def __init__(self, resume_repo: UserResumeRepository):
        self.resume_repo = resume_repo

    async def execute(self, user_id: int) -> list[UserResumeDTO]:
        resumes = await self.resume_repo.get_all_by_user(user_id)
        return [UserResumeDTO.model_validate(r) for r in resumes]
