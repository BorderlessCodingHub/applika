from app.application.dto.feedback_definition import (
    FeedbackDefinitionDTO,
    FeedbackDefinitionUpdateDTO,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)


class UpdateFeedbackDefinitionUseCase:
    def __init__(
        self, feedback_def_repo: FeedbackDefinitionRepository
    ):
        self.feedback_def_repo = feedback_def_repo

    async def execute(
        self,
        feedback_id: int,
        data: FeedbackDefinitionUpdateDTO,
        admin_id: int,
    ) -> FeedbackDefinitionDTO:
        feedback = await self.feedback_def_repo.get_by_id(
            feedback_id
        )
        if not feedback:
            logger.warning(
                f'Admin update feedback def failed: '
                f'{feedback_id}',
                extra={'extra_data': {
                    'event': (
                        'admin_update_feedback_definition'
                        '_failed'
                    ),
                    'reason': (
                        'feedback_definition_not_found'
                    ),
                    'feedback_definition_id': feedback_id,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceNotFound(
                'Feedback definition not found'
            )

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(feedback, key, value)

        feedback = await self.feedback_def_repo.update(feedback)

        logger.info(
            f'Admin updated feedback definition: '
            f'{feedback_id}',
            extra={'extra_data': {
                'event': (
                    'admin_update_feedback_definition'
                ),
                'feedback_definition_id': feedback_id,
                'admin_id': admin_id,
                'fields_updated': list(update_data.keys()),
            }},
        )

        return FeedbackDefinitionDTO.model_validate(feedback)
