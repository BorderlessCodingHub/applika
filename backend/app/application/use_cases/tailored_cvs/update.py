"""Update-application-CV-copy use case."""

from app.application.dto.tailored_cv import (
    TailoredCVDTO,
    TailoredCVUpdateDTO,
)
from app.application.use_cases.tailored_cvs.guards import (
    ensure_application_is_editable,
    load_owned_application,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)


class UpdateTailoredCVUseCase:
    """Replace the whole body of an application's CV copy.

    Every field is editable and every field is replaced (PUT semantics): the
    copy is a document the user owns outright, not a view over its master.
    Editing it never touches the master CV and never changes the copy's
    provenance.

    Refused on an archived (422) or finalized (409) application, in that
    order, exactly as a step would be.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        application_repo: ApplicationRepository,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.application_repo = application_repo

    async def execute(
        self, application_id: int, user_id: int, data: TailoredCVUpdateDTO
    ) -> TailoredCVDTO:
        application = await load_owned_application(
            self.application_repo, application_id, user_id
        )
        ensure_application_is_editable(application)

        tailored_cv = (
            await self.tailored_cv_repo.get_by_application_id_and_user_id(
                application_id, user_id
            )
        )
        if not tailored_cv:
            raise ResourceNotFound('CV copy not found')

        tailored_cv = await self.tailored_cv_repo.update(tailored_cv, data)
        logger.info(
            f'CV copy updated for application {application_id}',
            extra={
                'extra_data': {
                    'event': 'tailored_cv_updated',
                    'tailored_cv_id': tailored_cv.id,
                    'application_id': application_id,
                    'user_id': user_id,
                }
            },
        )
        return TailoredCVDTO.model_validate(tailored_cv)
