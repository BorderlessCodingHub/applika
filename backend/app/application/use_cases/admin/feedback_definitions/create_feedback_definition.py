from app.application.dto.feedback_definition import (
    FeedbackDefinitionCreateDTO,
    FeedbackDefinitionDTO,
)
from app.config.logging import logger
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)


class CreateFeedbackDefinitionUseCase:
    def __init__(
        self, feedback_def_repo: FeedbackDefinitionRepository
    ):
        self.feedback_def_repo = feedback_def_repo

    async def execute(
        self, data: FeedbackDefinitionCreateDTO, admin_id: int
    ) -> FeedbackDefinitionDTO:
        feedback = await self.feedback_def_repo.create(
            **data.model_dump()
        )

        logger.info(
            f'Admin created feedback definition: '
            f'{feedback.name}',
            extra={'extra_data': {
                'event': (
                    'admin_create_feedback_definition'
                ),
                'feedback_definition_id': feedback.id,
                'feedback_name': feedback.name,
                'admin_id': admin_id,
            }},
        )

        return FeedbackDefinitionDTO.model_validate(feedback)
