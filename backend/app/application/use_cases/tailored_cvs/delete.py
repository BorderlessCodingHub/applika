"""Delete-application-CV-copy use case."""

from app.application.use_cases.tailored_cvs.guards import (
    ensure_application_is_editable,
    load_owned_application,
)
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)


class DeleteTailoredCVUseCase:
    """Delete an application's CV copy, freeing it for a new one.

    Deleting the copy is not deleting anything else: the master CV it came
    from is untouched, and once the copy is gone the application can be given
    a fresh copy from any of the user's master CVs.

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

    async def execute(self, application_id: int, user_id: int) -> None:
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
            raise ResourceNotFound(
                'CV copy not found', ErrorCode.CV_COPY_NOT_FOUND
            )

        await self.tailored_cv_repo.delete(tailored_cv)
        logger.info(
            f'CV copy deleted for application {application_id}',
            extra={
                'extra_data': {
                    'event': 'tailored_cv_deleted',
                    'application_id': application_id,
                    'user_id': user_id,
                }
            },
        )
