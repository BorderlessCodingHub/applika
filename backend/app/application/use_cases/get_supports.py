from app.application.dto.support import (
    FeedbackDefinitionDTO,
    PlatformDTO,
    StepDefinitionDTO,
    SupportDTO,
)
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.platform_repository import PlatformRepository
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)


class GetSupportsUseCase:
    def __init__(
        self,
        feedback_repo: FeedbackDefinitionRepository,
        platform_repo: PlatformRepository,
        step_repo: StepDefinitionRepository,
    ):
        self.feedback_repository = feedback_repo
        self.platform_repository = platform_repo
        self.step_repository = step_repo

    async def execute(self) -> SupportDTO:
        feedbacks = await self.feedback_repository.get_all()
        platforms = await self.platform_repository.get_all()
        steps = await self.step_repository.get_all()

        return SupportDTO(
            feedbacks=[
                FeedbackDefinitionDTO.model_validate(f) for f in feedbacks
            ],
            platforms=[PlatformDTO.model_validate(p) for p in platforms],
            steps=[StepDefinitionDTO.model_validate(s) for s in steps],
        )
