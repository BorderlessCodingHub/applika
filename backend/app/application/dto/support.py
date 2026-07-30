from pydantic import BaseModel

from app.application.dto import BaseSchema


class FeedbackDefinitionDTO(BaseSchema):
    name: str
    color: str


class StepDefinitionDTO(BaseSchema):
    name: str
    color: str
    strict: bool


class PlatformDTO(BaseSchema):
    name: str
    url: str


class SupportDTO(BaseModel):
    feedbacks: list[FeedbackDefinitionDTO]
    steps: list[StepDefinitionDTO]
    platforms: list[PlatformDTO]
