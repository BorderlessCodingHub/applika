from pydantic import BaseModel

from app.application.dto import BaseSchema
from app.application.dto.feedback_definition import FeedbackDefinitionDTO
from app.application.dto.step_definition import StepDefinitionDTO


class PlatformDTO(BaseSchema):
    name: str
    url: str | None = None
    is_public: bool = True


class SupportDTO(BaseModel):
    feedbacks: list[FeedbackDefinitionDTO]
    steps: list[StepDefinitionDTO]
    platforms: list[PlatformDTO]
