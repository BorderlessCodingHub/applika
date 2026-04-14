from app.config.logging import logger
from app.core.exceptions import ResourceConflict
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class DeleteStepDefinitionUseCase:
    def __init__(
        self,
        step_def_repo: StepDefinitionRepository,
        admin_repo: AdminRepository,
    ):
        self.step_def_repo = step_def_repo
        self.admin_repo = admin_repo

    async def execute(
        self, step_id: int, admin_id: int
    ) -> None:
        refs = await self.admin_repo.count_entity_references(
            'step_definition', step_id
        )
        if refs > 0:
            logger.warning(
                f'Admin delete step def blocked: {step_id}',
                extra={'extra_data': {
                    'event': (
                        'admin_delete_step_definition_blocked'
                    ),
                    'reason': 'has_references',
                    'step_definition_id': step_id,
                    'references_count': refs,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceConflict(
                f'Cannot delete: {refs} application step(s) '
                f'reference this step definition'
            )

        await self.step_def_repo.delete(step_id)

        logger.info(
            f'Admin deleted step definition: {step_id}',
            extra={'extra_data': {
                'event': 'admin_delete_step_definition',
                'step_definition_id': step_id,
                'admin_id': admin_id,
            }},
        )
