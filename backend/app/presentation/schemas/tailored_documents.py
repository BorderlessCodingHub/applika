from datetime import datetime
from typing import Optional

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class AtsReportSchema(BaseSchema):
    score: Optional[int] = None
    warnings: list[str]
    missing_keywords: list[str]


class TailoredDocumentSchema(BaseSchema):
    id: SnowflakeID
    job_id: SnowflakeID
    kind: str
    provider: str
    content_json: str
    plain_text: str
    created_at: datetime
    ats_report: Optional[AtsReportSchema] = None


class TailorCvResponseSchema(TailoredDocumentSchema):
    pass
