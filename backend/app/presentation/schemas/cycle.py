from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema


class CreateCycle(BaseSchema):
    name: str


class Cycle(BaseSchema, TimeSchema):
    id: SnowflakeID
    name: str
