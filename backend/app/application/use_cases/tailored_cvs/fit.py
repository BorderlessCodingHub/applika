"""Get-application-CV-fit use case (ADR-0017, PRD 0012 R-028)."""

from app.application.dto.tailored_cv import (
    CVFitDTO,
    TailoredCVContent,
    TailoredCVDTO,
)
from app.application.services.keyword_fit import (
    cv_text,
    job_keywords,
    score_fit,
)
from app.application.use_cases.tailored_cvs.guards import (
    load_owned_application,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)


class GetTailoredCVFitUseCase:
    """The keyword fit of an application's CV copy for its job description.

    Same access as ``GET /cv``: the application must be the acting user's
    own - drafts included (ADR-0014, ``cv*`` routes) - and must have a copy,
    else the same 404s. A read, so no finalized or archived guard.

    The application's ``job_description`` is the job: an application made by
    hand fits the same way as one that came from a job. A blank description
    gives no fit (``score=None``, both lists empty), never a fake 0.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        application_repo: ApplicationRepository,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.application_repo = application_repo

    async def execute(self, application_id: int, user_id: int) -> CVFitDTO:
        application = await load_owned_application(
            self.application_repo, application_id, user_id
        )
        tailored_cv = (
            await self.tailored_cv_repo.get_by_application_id_and_user_id(
                application_id, user_id
            )
        )
        if not tailored_cv:
            raise ResourceNotFound(
                'CV copy not found', ErrorCode.CV_COPY_NOT_FOUND
            )

        job_description = application.job_description or ''
        if not job_description.strip():
            return CVFitDTO(score=None)

        copy = TailoredCVDTO.model_validate(tailored_cv)
        content = TailoredCVContent.model_validate(
            copy.model_dump(include=set(TailoredCVContent.model_fields))
        )
        fit = score_fit(job_keywords(job_description, []), cv_text(content))
        return CVFitDTO(
            score=fit.score,
            matched_keywords=fit.matched,
            missing_keywords=fit.missing,
        )
