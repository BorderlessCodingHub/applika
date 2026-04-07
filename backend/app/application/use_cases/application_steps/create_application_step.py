from fastapi.exceptions import RequestValidationError

from app.application.dto.application import ApplicationDTO
from app.application.dto.application_step import (
    ApplicationStepCreateDTO,
    ApplicationStepDTO,
)
from app.config.logging import logger
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
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


class CreateApplicationStepUseCase:
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
                                   data: ApplicationStepCreateDTO):
        """Enforce step chronology against the parent application and
        any pre-existing sibling steps.

        Errors are raised as ``RequestValidationError`` so FastAPI's
        default handler formats them as the standard 422 response.
        """
        if data.step_date < application.application_date:
            raise RequestValidationError([{
                'type': 'value_error',
                'loc': ('body', 'step_date'),
                'msg': (
                    'Value error, step_date cannot be earlier than the '
                    'application_date '
                    f'({application.application_date.isoformat()})'
                ),
                'input': data.step_date.isoformat(),
            }])

        existing_steps = (
            await self.application_step_repo.get_all_by_application_id(
                data.application_id
            )
        )
        existing_dates = [s.step_date for s in existing_steps]
        if existing_dates:
            min_step_date = max(existing_dates)
            if data.step_date < min_step_date:
                raise RequestValidationError([{
                    'type': 'value_error',
                    'loc': ('body', 'step_date'),
                    'msg': (
                        'Value error, step_date must be greater than or '
                        'equal to the previous step date '
                        f'({min_step_date.isoformat()})'
                    ),
                    'input': data.step_date.isoformat(),
                }])

    async def execute(
        self, user_id: int, data: ApplicationStepCreateDTO
    ) -> ApplicationDTO:
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

        step = await self.step_repo.get_by_id_non_strict_only(data.step_id)
        if not step:
            raise ResourceNotFound('Step not found or is invalid')

        await self._check_sibling_steps(application, data)

        application_step = await self.application_step_repo.create(data)
        logger.info(
            f'Step created for application {data.application_id}',
            extra={'extra_data': {
                'event': 'application_step_created',
                'application_id': data.application_id,
                'step_id': data.step_id,
                'user_id': user_id,
            }},
        )
        result = ApplicationStepDTO.model_validate(application_step)
        result.step_name = step.name
        return result
