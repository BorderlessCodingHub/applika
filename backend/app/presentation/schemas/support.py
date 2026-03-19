from typing import List

from pydantic import BaseModel

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class FeedbackDefinitionSchema(BaseSchema):
    id: SnowflakeID
    name: str
    color: str


class StepDefinitionSchema(BaseSchema):
    id: SnowflakeID
    name: str
    color: str
    strict: bool


class PlatformSchema(BaseSchema):
    id: SnowflakeID
    name: str
    url: str


class SupportSchema(BaseModel):
    feedbacks: List[FeedbackDefinitionSchema]
    steps: List[StepDefinitionSchema]
    platforms: List[PlatformSchema]
