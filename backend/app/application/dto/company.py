from pydantic import BaseModel, HttpUrl

from app.application.dto import BaseSchema


class CompanyCreateDTO(BaseModel):
    name: str
    url: HttpUrl
    created_by: int


class CompanyDTO(BaseSchema):
    name: str
    url: HttpUrl
    is_active: bool
    created_by: int | None = None
