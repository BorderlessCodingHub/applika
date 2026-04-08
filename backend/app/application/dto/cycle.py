from pydantic import BaseModel

from app.application.dto import BaseSchema


class CycleCreateDTO(BaseModel):
    name: str


class CycleDTO(BaseSchema):
    user_id: int
    name: str
