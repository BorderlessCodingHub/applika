from app.application.dto.step_definition import (
    StepDefinitionDTO,
    StepDefinitionUpdateDTO,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class UpdateStepDefinitionUseCase:
    def __init__(
        self, step_def_repo: StepDefinitionRepository
    ):
        self.step_def_repo = step_def_repo

    async def execute(
        self,
        step_id: int,
        data: StepDefinitionUpdateDTO,
        admin_id: int,
    ) -> StepDefinitionDTO:
        step = await self.step_def_repo.get_by_id(step_id)
        if not step:
            logger.warning(
                f'Admin update step def failed: {step_id}',
                extra={'extra_data': {
                    'event': (
                        'admin_update_step_definition_failed'
                    ),
                    'reason': 'step_definition_not_found',
                    'step_definition_id': step_id,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceNotFound(
                'Step definition not found'
            )

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(step, key, value)

        step = await self.step_def_repo.update(step)

        logger.info(
            f'Admin updated step definition: {step_id}',
            extra={'extra_data': {
                'event': 'admin_update_step_definition',
                'step_definition_id': step_id,
                'admin_id': admin_id,
                'fields_updated': list(update_data.keys()),
            }},
        )

        return StepDefinitionDTO.model_validate(step)
