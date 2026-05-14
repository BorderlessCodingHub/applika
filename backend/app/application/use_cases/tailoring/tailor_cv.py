from __future__ import annotations

import json

from app.application.dto.tailored_documents import (
    AtsReportDTO,
    TailoredDocumentDTO,
)
from app.application.services import ats_service
from app.application.services.cv_tailor_service import (
    render_cv_plaintext,
    tailor_cv_heuristic,
)
from app.core.exceptions import ResourceNotFound
from app.domain.models import AtsReportModel
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.tailored_document_repository import (
    TailoredDocumentRepository,
)
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)


class TailorCvUseCase:
    def __init__(
        self,
        job_repo: JobRepository,
        resume_repo: UserResumeRepository,
        tailored_doc_repo: TailoredDocumentRepository,
    ):
        self.job_repo = job_repo
        self.resume_repo = resume_repo
        self.tailored_doc_repo = tailored_doc_repo

    async def execute(
        self,
        job_id: int,
        user_id: int,
        resume_id: int | None = None,
    ) -> TailoredDocumentDTO:
        job = await self.job_repo.get_by_id(job_id)
        if job is None:
            raise ResourceNotFound('Job not found')

        if resume_id is not None:
            resume = await self.resume_repo.get_by_id_and_user(
                resume_id, user_id
            )
        else:
            resume = await self.resume_repo.get_default_by_user(user_id)

        if resume is None:
            raise ResourceNotFound('No resume found for tailoring')

        cv = tailor_cv_heuristic(resume.parsed_text, job.description_text)
        plain_text = render_cv_plaintext(cv)
        content_json = json.dumps(cv.as_dict())

        doc = await self.tailored_doc_repo.create(
            user_id=user_id,
            job_id=job_id,
            resume_id=resume.id,
            content_json=content_json,
            plain_text=plain_text,
            provider='heuristic',
        )

        # Persist ATS report
        jd_keywords = cv.ats_warnings  # already computed inside tailor
        ats_result = ats_service.check(plain_text, jd_keywords=[])
        ats_model = AtsReportModel(
            tailored_document_id=doc.id,
            score=None,
            warnings_json=json.dumps(cv.ats_warnings),
            missing_keywords_json=json.dumps([]),
        )
        self.tailored_doc_repo.session.add(ats_model)
        try:
            await self.tailored_doc_repo.session.commit()
            await self.tailored_doc_repo.session.refresh(ats_model)
        except Exception as e:
            await self.tailored_doc_repo.session.rollback()
            raise e

        ats_dto = AtsReportDTO(
            score=None,
            warnings=cv.ats_warnings,
            missing_keywords=[],
        )

        return TailoredDocumentDTO(
            id=doc.id,
            job_id=doc.job_id,
            kind=doc.kind,
            provider=doc.provider,
            content_json=doc.content_json,
            plain_text=doc.plain_text,
            created_at=doc.created_at,
            ats_report=ats_dto,
        )
