"""Create-application-CV-copy use case."""

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import (
    TailoredCVContent,
    TailoredCVCreateDTO,
    TailoredCVDTO,
    TailoringRequest,
)
from app.application.services.tailoring import TailoringResolver
from app.application.use_cases.tailored_cvs.guards import (
    ensure_application_is_editable,
    load_owned_application,
)
from app.config.logging import logger
from app.core.exceptions import (
    BusinessRuleViolation,
    ResourceConflict,
    ResourceNotFound,
)
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)

NO_JOB_DESCRIPTION_MESSAGE = 'Add a job description to tailor by keywords'


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

    ``tailoring: 'keywords'`` (ADR-0017) needs something to match against:
    on an application with a blank job description it is a 422, checked
    right after the editability guard and before any other read, so a
    refusal writes nothing. ``'copy'`` - the default - never needs one.

    The copy itself is produced by the tailoring port, never assembled here -
    the resolver picks the binding for this request (the clone by default).
    The master CV is only read, so a binding failure would be raised before
    the single write and would leave the master provably intact.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        base_cv_repo: BaseCVRepository,
        application_repo: ApplicationRepository,
        tailoring_resolver: TailoringResolver,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.base_cv_repo = base_cv_repo
        self.application_repo = application_repo
        self.tailoring_resolver = tailoring_resolver

    async def execute(self, data: TailoredCVCreateDTO) -> TailoredCVDTO:
        application = await load_owned_application(
            self.application_repo, data.application_id, data.user_id
        )
        ensure_application_is_editable(application)

        if (
            data.tailoring == 'keywords'
            and not (application.job_description or '').strip()
        ):
            raise BusinessRuleViolation(NO_JOB_DESCRIPTION_MESSAGE)

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

        base_cv_dto = BaseCVDTO.model_validate(base_cv)

        # The snapshot the diff baseline reads (R5, KODI-017 part 2) is the
        # master CV's content *at this moment*, built **before** the port
        # runs and from a deep copy of the master's own dump - not a
        # reference to ``base_cv_dto`` and not from ``result.content``.
        # Pydantic v2 does not copy nested model instances on
        # ``model_validate``, so validating straight from ``base_cv_dto``
        # would leave every section item shared by reference with whatever
        # the tailoring port hands back; a future model-backed binding that
        # mutates ``result.content`` items in place could then silently move
        # the snapshot too. The round trip through ``model_dump()`` forces a
        # real copy, so the snapshot stays the untailored master no matter
        # what the binding does to its own output afterwards.
        base_snapshot = TailoredCVContent.model_validate(
            base_cv_dto.model_dump(include=set(TailoredCVContent.model_fields))
        )

        result = await self.tailoring_resolver(data.tailoring).tailor(
            TailoringRequest(
                base_cv=base_cv_dto,
                job_description=application.job_description,
            )
        )

        tailored_cv = await self.tailored_cv_repo.create(
            user_id=data.user_id,
            application_id=data.application_id,
            base_cv_id=data.base_cv_id,
            result=result,
            base_snapshot=base_snapshot,
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
                    'tailoring': data.tailoring,
                    'was_ai_generated': tailored_cv.was_ai_generated,
                }
            },
        )
        return TailoredCVDTO.model_validate(tailored_cv)
