from app.application.dto.application import (
    ApplicationDTO,
    FinalizeApplicationDTO,
)
from app.application.dto.application_step import ApplicationStepCreateDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class FinalizeApplicationUseCase:
    def __init__(
        self,
        step_repo: StepDefinitionRepository,
        feedback_repo: FeedbackDefinitionRepository,
        application_repo: ApplicationRepository,
        application_step_repo: ApplicationStepRepository,
    ):
        self.step_repo = step_repo
        self.feedback_repo = feedback_repo
        self.application_repo = application_repo
        self.application_step_repo = application_step_repo

    async def execute(
        self, id: int, user_id: int, data: FinalizeApplicationDTO
    ) -> ApplicationDTO:
        application = await self.application_repo.get_by_id_and_user_id(
            id, user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )

        step = await self.step_repo.get_by_id_strict_only(data.step_id)
        if not step:
            raise ResourceNotFound('Step not found or is invalid')

        feedback = await self.feedback_repo.get_by_id(data.feedback_id)
        if not feedback:
            raise ResourceNotFound('Feedback not found')

        # Insert final step record
        application_step = ApplicationStepCreateDTO(
            application_id=application.id,
            step_id=step.id,
            step_date=data.finalize_date,
            observation=data.observation,
        )
        await self.application_step_repo.create(application_step)

        application.last_step_id = step.id
        application.last_step_date = data.finalize_date
        application.feedback_id = feedback.id
        application.feedback_date = data.finalize_date
        application.salary_offer = data.salary_offer

        application = await self.application_repo.update(application)
        return ApplicationDTO.model_validate(application)
