from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AtsReportDTO(BaseModel):
    score: Optional[int]
    warnings: list[str]
    missing_keywords: list[str]


class TailoredDocumentDTO(BaseModel):
    id: int
    job_id: int
    kind: str
    provider: str
    content_json: str
    plain_text: str
    created_at: datetime
    ats_report: Optional[AtsReportDTO]

    model_config = ConfigDict(from_attributes=True)
