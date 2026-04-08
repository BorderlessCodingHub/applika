from app.application.dto.application import ApplicationDTO
from app.application.dto.application_step import (
    ApplicationStepDTO,
    ApplicationStepUpdateDTO,
)
from app.application.validators.application_date import ensure_not_in_future
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    InvalidDate,
    ResourceNotFound,
)
from app.domain.models import ApplicationModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class UpdateApplicationStepUseCase:
    def __init__(
        self,
        step_repo: StepDefinitionRepository,
        application_repo: ApplicationRepository,
        application_step_repo: ApplicationStepRepository,
    ):
        self.step_repo = step_repo
        self.application_repo = application_repo
        self.application_step_repo = application_step_repo

    async def _check_sibling_steps(self, application: ApplicationModel,
                                   data: ApplicationStepUpdateDTO,
                                   step_id: int):
        """Enforce step chronology against the parent application and
        the updated step's neighbouring siblings.

        Errors are raised as ``RequestValidationError`` so FastAPI's
        default handler formats them as the standard 422 response.
        """
        if data.step_date < application.application_date:
            raise InvalidDate(
                'step_date cannot be earlier than the application_date '
                f'({application.application_date.isoformat()})'
            )

        sibling_steps = list(
            await self.application_step_repo.get_all_by_application_id(
                application.id
            )
        )
        # Steps are ordered by creation. The updated step must remain
        # within the chronological window defined by its neighbours.
        prev_date = None
        next_date = None
        for index, sibling in enumerate(sibling_steps):
            if sibling.id == step_id:
                if index > 0:
                    prev_date = sibling_steps[index - 1].step_date
                if index < len(sibling_steps) - 1:
                    next_date = sibling_steps[index + 1].step_date
                break

        if prev_date is not None and data.step_date < prev_date:
            raise InvalidDate(
                "Step date must be greater than or equal to the previous step date"
            )

        if next_date is not None and data.step_date > next_date:
            raise InvalidDate(
                "Step date must be less than or equal to the next step date"
            )

    async def execute(
        self, id: int, user_id: int, data: ApplicationStepUpdateDTO
    ) -> ApplicationDTO:
        ensure_not_in_future(data.step_date, 'step_date')

        application = await self.application_repo.get_by_id_and_user_id(
            data.application_id, user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )
        if application.cycle_id is not None:
            raise BusinessRuleViolation(
                'Cannot modify an application from an archived cycle'
            )
        if application.feedback_id is not None:
            raise ApplicationFinalized(
                'This application has already been finalized'
            )

        application_step = (
            await self.application_step_repo.get_by_id_and_app_id_and_user_id(
                id, data.application_id, user_id
            )
        )
        if not application_step:
            raise ResourceNotFound(
                'Application step not found or not owned by user'
            )

        step = await self.step_repo.get_by_id_non_strict_only(data.step_id)
        if not step:
            raise ResourceNotFound('Step not found or is invalid')

        await self._check_sibling_steps(application, data, application_step.id)

        application_step.application_id = data.application_id
        application_step.step_id = data.step_id
        application_step.step_date = data.step_date
        application_step.observation = data.observation

        application_step = await self.application_step_repo.update(
            application_step
        )
        result = ApplicationStepDTO.model_validate(application_step)
        result.step_name = step.name
        return result
