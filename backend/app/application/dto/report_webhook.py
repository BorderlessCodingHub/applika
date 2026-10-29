from pydantic import Field

from app.application.dto import BaseSchema


class ReportWebhookDTO(BaseSchema):
    url: str = Field(repr=False)
    badge: str | None = None
    label: str | None = None
