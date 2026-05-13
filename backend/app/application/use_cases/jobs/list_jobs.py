from __future__ import annotations

import json
from datetime import datetime

from app.application.dto.jobs import JobListItemDTO, JobListResponseDTO
from app.domain.repositories.job_repository import JobRepository


class ListJobsUseCase:
    def __init__(self, job_repo: JobRepository):
        self.job_repo = job_repo

    async def execute(
        self,
        user_id: int,
        resume_id: int | None,
        source: str | None,
        search: str | None,
        min_fit: int | None,
        posted_after: datetime | None,
        sort: str,
        page: int,
        page_size: int,
    ) -> JobListResponseDTO:
        rows, total = await self.job_repo.list_jobs(
            user_id=user_id,
            resume_id=resume_id,
            source=source,
            search=search,
            min_fit=min_fit,
            posted_after=posted_after,
            sort=sort,
            page=page,
            page_size=page_size,
        )

        items = [_row_to_dto(row) for row in rows]
        return JobListResponseDTO(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )


def _row_to_dto(row: dict) -> JobListItemDTO:
    matched = row.get('matched_keywords_json')
    missing = row.get('missing_keywords_json')
    return JobListItemDTO(
        id=row['id'],
        source_code=row['source_code'],
        title=row['title'],
        company_name=row['company_name'],
        location_text=row['location_text'],
        job_url=row['job_url'],
        employment_type=row.get('employment_type'),
        salary_text=row.get('salary_text'),
        posted_at=row.get('posted_at'),
        tags=row.get('tags', []),
        fit_score=row.get('fit_score'),
        matched_keywords=json.loads(matched) if matched else [],
        missing_keywords=json.loads(missing) if missing else [],
    )
