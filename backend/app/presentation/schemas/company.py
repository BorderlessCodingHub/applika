from pydantic import HttpUrl

from app.presentation.schemas import BaseSchema, TimeSchema


class CreateCompany(BaseSchema):
    name: str
    url: HttpUrl


class Company(BaseSchema, TimeSchema):
    id: int
    name: str
    url: HttpUrl
