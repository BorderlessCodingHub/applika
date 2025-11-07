from typing import List

from pydantic import BaseModel

from app.presentation.schemas import BaseSchema


class FeedbackDefinitionSchema(BaseSchema):
    id: int
    name: str
    color: str


class StepDefinitionSchema(BaseSchema):
    id: int
    name: str
    color: str
    strict: bool


class PlatformSchema(BaseSchema):
    id: int
    name: str
    url: str


class SupportSchema(BaseModel):
    feedbacks: List[FeedbackDefinitionSchema]
    steps: List[StepDefinitionSchema]
    platforms: List[PlatformSchema]
