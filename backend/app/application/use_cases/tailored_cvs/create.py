"""Create-application-CV-copy use case."""

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import (
    TailoredCVCreateDTO,
    TailoredCVDTO,
    TailoringRequest,
)
from app.application.services.tailoring import TailoringService
from app.application.use_cases.tailored_cvs.guards import (
    ensure_application_is_editable,
    load_owned_application,
)
from app.config.logging import logger
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)


class CreateTailoredCVUseCase:
    """Make an application's CV copy from one of the user's master CVs.

    The order of the checks is the one ``CreateApplicationStepUseCase``
    established: the application must exist and be owned (404), then it must
    be editable (422 archived, 409 finalized), and only then are the other
    resources looked at. That is what makes the refusal literally the same as
    a step's.

    Both owner checks matter. The application is authorized through
    ``load_owned_application``; the master CV is authorized separately through
    ``get_by_id_and_user_id``, so another user's master CV can never become
    the source of this user's copy. At most one copy per application: a second
    create is a 409 before the UNIQUE constraint ever sees it.

    The copy itself is produced by the tailoring port, never assembled here -
    that indirection is what lets a real model replace the clone later without
    changing the stored shape. The master CV is only read, so a binding
    failure would be raised before the single write and would leave the master
    provably intact.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        base_cv_repo: BaseCVRepository,
        application_repo: ApplicationRepository,
        tailoring_service: TailoringService,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.base_cv_repo = base_cv_repo
        self.application_repo = application_repo
        self.tailoring_service = tailoring_service

    async def execute(self, data: TailoredCVCreateDTO) -> TailoredCVDTO:
        application = await load_owned_application(
            self.application_repo, data.application_id, data.user_id
        )
        ensure_application_is_editable(application)

        base_cv = await self.base_cv_repo.get_by_id_and_user_id(
            data.base_cv_id, data.user_id
        )
        if not base_cv:
            raise ResourceNotFound('Base CV not found')

        existing = (
            await self.tailored_cv_repo.get_by_application_id_and_user_id(
                data.application_id, data.user_id
            )
        )
        if existing:
            raise ResourceConflict('This application already has a CV copy')

        result = await self.tailoring_service.tailor(
            TailoringRequest(
                base_cv=BaseCVDTO.model_validate(base_cv),
                job_description=application.job_description,
            )
        )

        tailored_cv = await self.tailored_cv_repo.create(
            user_id=data.user_id,
            application_id=data.application_id,
            base_cv_id=data.base_cv_id,
            result=result,
        )
        logger.info(
            f'CV copy created for application {data.application_id}',
            extra={
                'extra_data': {
                    'event': 'tailored_cv_created',
                    'tailored_cv_id': tailored_cv.id,
                    'application_id': data.application_id,
                    'base_cv_id': data.base_cv_id,
                    'user_id': data.user_id,
                    'was_ai_generated': tailored_cv.was_ai_generated,
                }
            },
        )
        return TailoredCVDTO.model_validate(tailored_cv)
