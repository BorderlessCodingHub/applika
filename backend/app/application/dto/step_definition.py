from pydantic import BaseModel

from app.application.dto import BaseSchema


class StepDefinitionCreateDTO(BaseModel):
    name: str
    color: str = '#007bff'
    strict: bool = False


class StepDefinitionUpdateDTO(BaseModel):
    name: str | None = None
    color: str | None = None
    strict: bool | None = None


class StepDefinitionDTO(BaseSchema):
    name: str
    color: str
    strict: bool
