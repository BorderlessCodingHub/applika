"""Get-application-CV-copy use case."""

from app.application.dto.tailored_cv import TailoredCVDTO
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


class GetTailoredCVUseCase:
    """Fetch the CV copy of one of the acting user's own applications.

    Deliberately **not** guarded by ``ensure_application_is_editable``:
    viewing always works, finalized or archived. Only writing is refused.

    Ownership is still checked, and against the application's owner first: an
    application that does not exist or belongs to someone else is a 404, admin
    or not, and so is an application that simply has no copy yet.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        application_repo: ApplicationRepository,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.application_repo = application_repo

    async def execute(self, application_id: int, user_id: int) -> TailoredCVDTO:
        await load_owned_application(
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
        return TailoredCVDTO.model_validate(tailored_cv)
