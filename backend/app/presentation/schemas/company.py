from pydantic import HttpUrl

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema


class CreateCompany(BaseSchema):
    name: str
    url: HttpUrl


class Company(BaseSchema, TimeSchema):
    id: SnowflakeID
    name: str
    url: HttpUrl
