from pydantic import BaseModel, HttpUrl, field_validator

from app.application.dto import BaseSchema


class CompanyCreateDTO(BaseModel):
    name: str
    url: HttpUrl
    created_by: int

    @field_validator('url')
    @classmethod
    def validate_linkedin_url(cls, v):
        url_str = str(v)
        if not url_str.startswith((
            'https://www.linkedin.com/',
            'https://linkedin.com/',
        )):
            raise ValueError(
                'Only LinkedIn URLs are accepted'
                ' (https://www.linkedin.com/...)'
            )
        return v


class CompanyDTO(BaseSchema):
    name: str
    url: HttpUrl
    is_active: bool
    created_by: int | None = None
