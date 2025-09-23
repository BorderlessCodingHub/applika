from app.application.dto.application import ApplicationDTO
from app.application.dto.application_step import (
    ApplicationStepDTO,
    ApplicationStepUpdateDTO,
)
from app.core.exceptions import ResourceNotFound
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

    async def execute(
        self, id: int, user_id: int, data: ApplicationStepUpdateDTO
    ) -> ApplicationDTO:
        application = await self.application_repo.get_by_id_and_user_id(
            data.application_id, user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )

        application_step = (
            await self.application_step_repo.get_by_id_and_user_id(id, user_id)
        )
        if not application_step:
            raise ResourceNotFound(
                'Application step not found or not owned by user'
            )

        step = await self.step_repo.get_by_id_non_strict_only(data.step_id)
        if not step:
            raise ResourceNotFound('Step not found or is invalid')

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
