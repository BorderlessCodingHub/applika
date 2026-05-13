from __future__ import annotations

import uuid
from pathlib import Path

from app.application.dto.resumes import UserResumeDTO
from app.application.services.resume_parser_service import parse_resume
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)

_STORAGE_BASE = Path(__file__).resolve().parents[5] / 'storage' / 'resumes'


class UploadResumeUseCase:
    def __init__(self, resume_repo: UserResumeRepository):
        self.resume_repo = resume_repo

    async def execute(
        self,
        user_id: int,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> UserResumeDTO:
        parsed = parse_resume(data, content_type, filename)

        user_dir = _STORAGE_BASE / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        unique_name = f'{uuid.uuid4().hex}_{filename}'
        storage_path = str(user_dir / unique_name)
        Path(storage_path).write_bytes(data)

        existing = await self.resume_repo.get_all_by_user(user_id)
        is_default = len(existing) == 0

        resume = await self.resume_repo.create(
            user_id=user_id,
            filename=filename,
            content_type=content_type,
            storage_path=storage_path,
            parsed_text=parsed.text,
            byte_size=parsed.byte_size,
            is_default=is_default,
        )
        return UserResumeDTO.model_validate(resume)
