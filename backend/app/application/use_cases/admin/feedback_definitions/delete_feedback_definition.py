from app.config.logging import logger
from app.core.exceptions import ResourceConflict
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)


class DeleteFeedbackDefinitionUseCase:
    def __init__(
        self,
        feedback_def_repo: FeedbackDefinitionRepository,
        admin_repo: AdminRepository,
    ):
        self.feedback_def_repo = feedback_def_repo
        self.admin_repo = admin_repo

    async def execute(
        self, feedback_id: int, admin_id: int
    ) -> None:
        refs = await self.admin_repo.count_entity_references(
            'feedback_definition', feedback_id
        )
        if refs > 0:
            logger.warning(
                f'Admin delete feedback def blocked: '
                f'{feedback_id}',
                extra={'extra_data': {
                    'event': (
                        'admin_delete_feedback_definition'
                        '_blocked'
                    ),
                    'reason': 'has_references',
                    'feedback_definition_id': feedback_id,
                    'references_count': refs,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceConflict(
                f'Cannot delete: {refs} application(s) '
                f'reference this feedback definition'
            )

        await self.feedback_def_repo.delete(feedback_id)

        logger.info(
            f'Admin deleted feedback definition: '
            f'{feedback_id}',
            extra={'extra_data': {
                'event': (
                    'admin_delete_feedback_definition'
                ),
                'feedback_definition_id': feedback_id,
                'admin_id': admin_id,
            }},
        )
