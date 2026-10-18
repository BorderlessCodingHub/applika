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
    """The ``/supports`` lists, unchanged in shape (R-018).

    The step and feedback lists are the frozen catalogs: nothing writes them
    since the admin catalog routes were removed (R-021), and they are served
    only so installed ``applika-cli`` 0.1.4 can keep resolving step and
    feedback names. New clients use the fixed ``EventType`` (three
    values, ADR-0020) and ``InterviewType`` enums instead.
    """

    def __init__(
        self,
        feedback_repo: FeedbackDefinitionRepository,
        platform_repo: PlatformRepository,
        step_repo: StepDefinitionRepository,
    ):
        self.feedback_repository = feedback_repo
        self.platform_repository = platform_repo
        self.step_repository = step_repo

    async def execute(self, user_id: int) -> SupportDTO:
        feedbacks = await self.feedback_repository.get_all()
        platforms = await self.platform_repository.list_visible(user_id)
        steps = await self.step_repository.get_all()

        return SupportDTO(
            feedbacks=[
                FeedbackDefinitionDTO.model_validate(f) for f in feedbacks
            ],
            platforms=[PlatformDTO.model_validate(p) for p in platforms],
            steps=[StepDefinitionDTO.model_validate(s) for s in steps],
        )
