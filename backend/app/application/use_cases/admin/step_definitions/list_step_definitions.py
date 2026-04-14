from app.application.dto.step_definition import (
    StepDefinitionDTO,
)
from app.config.logging import logger
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class ListStepDefinitionsUseCase:
    def __init__(
        self, step_def_repo: StepDefinitionRepository
    ):
        self.step_def_repo = step_def_repo

    async def execute(
        self, admin_id: int
    ) -> list[StepDefinitionDTO]:
        logger.info(
            'Admin listed step definitions',
            extra={'extra_data': {
                'event': 'admin_list_step_definitions',
                'admin_id': admin_id,
            }},
        )
        steps = await self.step_def_repo.get_all()
        return [
            StepDefinitionDTO.model_validate(s) for s in steps
        ]
