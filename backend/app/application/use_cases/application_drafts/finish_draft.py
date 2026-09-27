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
    #8): a CV copy is required, ``is_draft`` flips to false and ``cycle_id``
    stays NULL - a finished draft joins the current board like any other
    application. KODI-036, R-003: the finish body's ``application_date`` is
    optional - given, it wins; absent, the draft's own stored date (set on
    create or on a later PUT) is used. Either way the date is refused in the
    future, same rule every other application date uses."""

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

        day = data.application_date or application.application_date
        ensure_not_in_future(day, 'application_date')

        application.application_date = day
        application.is_draft = False

        application = await self.application_repo.update(application)
        return await self.read_model.one(application)
