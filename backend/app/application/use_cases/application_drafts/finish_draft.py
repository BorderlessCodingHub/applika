from app.application.dto.application import ApplicationDTO
from app.application.dto.application_draft import DraftFinishDTO
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.validators.application_date import ensure_not_in_future
from app.core.exceptions import BusinessRuleViolation, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)

NEEDS_CV_MESSAGE = 'Pick a master CV before finishing'


class FinishDraftUseCase:
    """Turn a draft into a normal application (KODI-032 acceptance #2, #7,
    #8): a CV copy is required, the finish date is the caller's own
    calendar day (refused in the future, same rule every other application
    date uses), ``is_draft`` flips to false and ``cycle_id`` stays NULL - a
    finished draft joins the current board like any other application."""

    def __init__(
        self,
        application_repo: ApplicationRepository,
        read_model: ApplicationReadModel,
    ):
        self.application_repo = application_repo
        self.read_model = read_model

    async def execute(self, id: int, data: DraftFinishDTO) -> ApplicationDTO:
        application = await self.application_repo.get_draft(id, data.user_id)
        if not application:
            raise ResourceNotFound('Draft not found')

        if application.tailored_cv is None:
            raise BusinessRuleViolation(NEEDS_CV_MESSAGE)

        ensure_not_in_future(data.application_date, 'application_date')

        application.application_date = data.application_date
        application.is_draft = False

        application = await self.application_repo.update(application)
        return await self.read_model.one(application)
