from app.application.dto.step_definition import (
    StepDefinitionCreateDTO,
    StepDefinitionDTO,
)
from app.config.logging import logger
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class CreateStepDefinitionUseCase:
    def __init__(
        self, step_def_repo: StepDefinitionRepository
    ):
        self.step_def_repo = step_def_repo

    async def execute(
        self, data: StepDefinitionCreateDTO, admin_id: int
    ) -> StepDefinitionDTO:
        step = await self.step_def_repo.create(
            **data.model_dump()
        )

        logger.info(
            f'Admin created step definition: {step.name}',
            extra={'extra_data': {
                'event': 'admin_create_step_definition',
                'step_definition_id': step.id,
                'step_name': step.name,
                'strict': step.strict,
                'admin_id': admin_id,
            }},
        )

        return StepDefinitionDTO.model_validate(step)
