"""Admin report webhook request/response shapes (ADR-0024).

Every request field is optional on purpose: pydantic reports a *missing*
required field with the whole body as ``input``, which would put the
submitted ``webhook_url`` into a 422. A missing or blank value reaches the
use case instead, which raises a fixed-string 422.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.application.dto.report_webhook import ReportWebhookDTO
from app.application.validators.report_webhook import mask
from app.lib.types import SnowflakeID


class CreateReportWebhookSchema(BaseModel):
    webhook_url: str | None = None
    badge: str | None = None
    label: str | None = None

    model_config = ConfigDict(extra='ignore')


class UpdateReportWebhookSchema(BaseModel):
    webhook_url: str | None = None
    badge: str | None = None
    label: str | None = None

    model_config = ConfigDict(extra='ignore')


class ReportWebhookSchema(BaseModel):
    """The only shape a report webhook is returned in: never the full
    URL."""

    id: SnowflakeID
    label: str | None = None
    badge: Literal['borderless_base', 'borderless_psp'] | None = None
    webhook_url_masked: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(extra='forbid')

    @classmethod
    def from_dto(cls, dto: ReportWebhookDTO) -> 'ReportWebhookSchema':
        return cls.model_validate({
            'id': SnowflakeID(dto.id),
            'label': dto.label,
            'badge': dto.badge,
            'webhook_url_masked': mask(dto.url),
            'created_at': dto.created_at,
            'updated_at': dto.updated_at,
        })
