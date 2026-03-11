from pydantic import HttpUrl, field_validator

from app.presentation.schemas import BaseSchema, TimeSchema


class CreateCompany(BaseSchema):
    name: str
    url: HttpUrl

    @field_validator('url')
    @classmethod
    def validate_linkedin_url(cls, v):
        url_str = str(v)
        if not url_str.startswith(
            ('https://www.linkedin.com/', 'https://linkedin.com/')
        ):
            raise ValueError(
                'Only LinkedIn URLs are accepted'
                ' (https://www.linkedin.com/...)'
            )
        return v


class Company(BaseSchema, TimeSchema):
    id: int
    name: str
    url: HttpUrl
