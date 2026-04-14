from pydantic import BaseModel

from app.application.dto import BaseSchema


class FeedbackDefinitionCreateDTO(BaseModel):
    name: str
    color: str = '#28a745'


class FeedbackDefinitionUpdateDTO(BaseModel):
    name: str | None = None
    color: str | None = None


class FeedbackDefinitionDTO(BaseSchema):
    name: str
    color: str
