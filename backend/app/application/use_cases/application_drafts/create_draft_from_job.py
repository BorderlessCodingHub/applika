"""Start a draft application from a job (KODI-047, PRD 0012 R-017..R-022,
R-026).

Ported from Ían Muliterno's ``create_application_from_job.py``
(``job_scrapping``, the PR this feature comes from): the job's title, company,
company website, posting link and source fill the new application, dated
the caller's local day (KODI-050; server UTC today when not sent) in mode
"active", and a company with a website becomes a company row.
Rebuilt on applika's model (PRD 0010, ADR-0014): the result is a *draft*,
not an application; the platform is the source's own platform (R-019)
instead of a lookup by name; the company goes through ``resolve_company``
(a visible match is reused, else a new private company, R-018) instead of an
unconditional create; one application per user per job (R-021); and an
optional master CV copy is made in the same request (R-020).

Checks, all before any write: a given ``application_date`` lies within
[UTC today - 1, UTC today + 1], every real timezone's "today" (422
``InvalidDate``), the job is listed (404), the caller has no
application from it (409), it has a title (422), the
source's platform is visible (404), the
master CV is the caller's own (404) and ``keywords`` has a job description
to match (422). A job without a company name (scrapers may store ``''``)
is started anyway: the draft's company is the free text ``Unknown company``
and no company row is resolved or created, even with a ``company_url``.
Then the writes:

1. ``resolve_company`` - a new private company commits on its own (plan
   corrections 5): on a later failure it stays, private to the caller, and
   is reused next time;
2. the draft is added and flushed, not committed (``commit=False``);
3. with a master CV, ``CreateTailoredCVUseCase`` makes the copy on the same
   session and its commit carries the draft too; without one, the draft
   commits alone. Any failure rolls the draft back.

Two starts racing past the 409 check meet ``uq_applications_user_job`` at
the flush: the loser's ``IntegrityError`` is the same 409.
"""

from datetime import date

from pydantic import HttpUrl, TypeAdapter, ValidationError
from sqlalchemy.exc import IntegrityError

from app.application.dto.application import ApplicationCompanyInputDTO
from app.application.dto.application_draft import DraftDTO, DraftInputDTO
from app.application.dto.tailored_cv import TailoredCVCreateDTO, TailoringMode
from app.application.use_cases.application_drafts.create_draft import (
    to_draft_dto,
)
from app.application.use_cases.catalog.resolve import (
    ensure_platform_visible,
    resolve_company,
)
from app.application.use_cases.jobs.get_job import JOB_NOT_FOUND
from app.application.use_cases.tailored_cvs.create import (
    NO_JOB_DESCRIPTION_MESSAGE,
    CreateTailoredCVUseCase,
)
from app.application.validators.application_date import (
    ensure_not_before_yesterday,
    ensure_not_in_future,
    utc_today,
)
from app.config.logging import logger
from app.core.enums import WorkMode
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    BusinessRuleViolation,
    ResourceConflict,
    ResourceNotFound,
)
from app.domain.models import JobModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import JobSourceRepository
from app.domain.repositories.platform_repository import PlatformRepository

ALREADY_APPLIED = 'You already have an application for this job'
# A draft needs a role (PRD 0010, ``DraftInput``): a job without a title is
# refused before any write.
MISSING_JOB_TITLE = 'This job has no title to start from'
# A scraped posting may lack the company: the draft gets this free text and
# never a company row (no private company named ``''`` or after a URL alone).
UNKNOWN_COMPANY = 'Unknown company'

# Plan corrections 21: the application's limits; a longer job value is cut.
MAX_ROLE = 200
MAX_COMPANY_NAME = 200
MAX_JOB_DESCRIPTION = 50000

_http_url: TypeAdapter[HttpUrl] = TypeAdapter(HttpUrl)


def web_url(value: str | None) -> HttpUrl | None:
    """``value`` as an http(s) URL of at most 2083 characters, else
    ``None``."""
    if not value or not value.strip():
        return None
    try:
        return _http_url.validate_python(value.strip())
    except ValidationError:
        return None


def _cut(value: str, limit: int) -> str:
    return value.strip()[:limit].strip()


class CreateDraftFromJobUseCase:
    def __init__(
        self,
        job_repo: JobRepository,
        job_source_repo: JobSourceRepository,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
        base_cv_repo: BaseCVRepository,
        create_tailored_cv: CreateTailoredCVUseCase,
    ):
        self.job_repo = job_repo
        self.job_source_repo = job_source_repo
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo
        self.base_cv_repo = base_cv_repo
        self.create_tailored_cv = create_tailored_cv

    async def _platform_id(self, job: JobModel, user_id: int) -> int:
        source = await self.job_source_repo.get(job.source_id)
        if source is None or source.platform_id is None:
            raise ResourceNotFound(
                'Platform not found', ErrorCode.CAT_PLATFORM_NOT_FOUND
            )
        platform = await ensure_platform_visible(
            self.platform_repo, source.platform_id, user_id
        )
        return platform.id

    async def execute(
        self,
        job_id: int,
        user_id: int,
        base_cv_id: int | None = None,
        tailoring: TailoringMode = 'copy',
        application_date: date | None = None,
    ) -> DraftDTO:
        if application_date is None:
            application_date = utc_today()
        else:
            ensure_not_in_future(application_date, 'application_date')
            ensure_not_before_yesterday(application_date, 'application_date')

        job = await self.job_repo.get_by_id(job_id)
        if job is None or not job.is_active:
            raise ResourceNotFound(JOB_NOT_FOUND, ErrorCode.JOB_JOB_NOT_FOUND)

        if await self.application_repo.get_by_job_id(user_id, job.id):
            raise ResourceConflict(
                ALREADY_APPLIED, ErrorCode.APP_ALREADY_APPLIED
            )

        role = _cut(job.title, MAX_ROLE)
        if not role:
            raise BusinessRuleViolation(
                MISSING_JOB_TITLE, ErrorCode.APP_JOB_HAS_NO_TITLE
            )
        company_name = _cut(job.company_name, MAX_COMPANY_NAME)

        platform_id = await self._platform_id(job, user_id)

        job_description = job.description_text[:MAX_JOB_DESCRIPTION] or None
        if base_cv_id is not None:
            if not await self.base_cv_repo.get_by_id_and_user_id(
                base_cv_id, user_id
            ):
                raise ResourceNotFound(
                    'Base CV not found', ErrorCode.CV_BASE_CV_NOT_FOUND
                )
            if tailoring == 'keywords' and not (job_description or '').strip():
                raise BusinessRuleViolation(
                    NO_JOB_DESCRIPTION_MESSAGE, ErrorCode.CV_NO_JOB_DESCRIPTION
                )

        company_id: int | None = None
        company_url = web_url(job.company_url)
        if not company_name:
            company_name = UNKNOWN_COMPANY
        elif company_url is not None:
            company_id, company_name = await resolve_company(
                self.company_repo,
                ApplicationCompanyInputDTO(name=company_name, url=company_url),
                user_id,
            )

        data = DraftInputDTO(
            user_id=user_id,
            company_id=company_id,
            company_name=company_name,
            role=role,
            mode='active',
            platform_id=platform_id,
            application_date=application_date,
            link_to_job=web_url(job.job_url),
            work_mode=WorkMode.REMOTE,
            country=None,
            job_description=job_description,
        )
        try:
            application = await self.application_repo.create_draft(
                data,
                company_id=company_id,
                company_name=company_name,
                job_id=job.id,
                commit=base_cv_id is None,
            )
        except IntegrityError as e:
            if 'uq_applications_user_job' in str(e.orig):
                raise ResourceConflict(
                    ALREADY_APPLIED, ErrorCode.APP_ALREADY_APPLIED
                ) from e
            raise

        has_cv = False
        if base_cv_id is not None:
            try:
                await self.create_tailored_cv.execute(
                    TailoredCVCreateDTO(
                        user_id=user_id,
                        application_id=application.id,
                        base_cv_id=base_cv_id,
                        tailoring=tailoring,
                    )
                )
            except Exception:
                await self.application_repo.rollback()
                raise
            has_cv = True

        logger.info(
            f'Draft started from job {job.id}',
            extra={
                'extra_data': {
                    'event': 'draft_from_job_created',
                    'application_id': application.id,
                    'job_id': job.id,
                    'user_id': user_id,
                    'base_cv_id': base_cv_id,
                    'tailoring': tailoring if base_cv_id else None,
                }
            },
        )
        return to_draft_dto(application, has_cv=has_cv)
