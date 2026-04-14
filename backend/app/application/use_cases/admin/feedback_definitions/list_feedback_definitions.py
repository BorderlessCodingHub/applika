from app.application.dto.feedback_definition import (
    FeedbackDefinitionDTO,
)
from app.config.logging import logger
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)


class ListFeedbackDefinitionsUseCase:
    def __init__(
        self, feedback_def_repo: FeedbackDefinitionRepository
    ):
        self.feedback_def_repo = feedback_def_repo

    async def execute(
        self, admin_id: int
    ) -> list[FeedbackDefinitionDTO]:
        logger.info(
            'Admin listed feedback definitions',
            extra={'extra_data': {
                'event': 'admin_list_feedback_definitions',
                'admin_id': admin_id,
            }},
        )
        feedbacks = await self.feedback_def_repo.get_all()
        return [
            FeedbackDefinitionDTO.model_validate(f)
            for f in feedbacks
        ]
