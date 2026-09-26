from pydantic import BaseModel, HttpUrl

from app.application.dto import BaseSchema


class CompanyCreateDTO(BaseModel):
    name: str
    url: HttpUrl
    created_by: int


class CompanyInputDTO(BaseModel):
    """``POST /companies`` request, before the caller's id is known
    (``CreateCompanyUseCase.execute(data, user_id)``)."""

    name: str
    url: HttpUrl


class CompanyDTO(BaseSchema):
    name: str
    url: HttpUrl
    is_active: bool
    is_public: bool = True
    created_by: int | None = None
