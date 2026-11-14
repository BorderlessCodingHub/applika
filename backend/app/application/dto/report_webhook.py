from pydantic import Field

from app.application.dto import BaseSchema


class ReportWebhookDTO(BaseSchema):
    url: str = Field(repr=False)
    badges: list[str] = Field(default_factory=list)
    label: str | None = None
