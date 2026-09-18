from pydantic import BaseModel

from app.application.dto import BaseSchema
from app.application.dto.feedback_definition import FeedbackDefinitionDTO
from app.application.dto.step_definition import StepDefinitionDTO


class PlatformDTO(BaseSchema):
    name: str
    url: str


class SupportDTO(BaseModel):
    feedbacks: list[FeedbackDefinitionDTO]
    steps: list[StepDefinitionDTO]
    platforms: list[PlatformDTO]
