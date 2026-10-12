"""DTOs of the saved job searches (KODI-047, PRD 0012 R-030): a name and
the ``JobFilters`` body it applies to the job list. No notification field:
a saved search never notifies anyone (R-032)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class JobSearchInputDTO(BaseModel):
    """``filters`` is the ``JobFilters`` body, already validated by the wire
    schema and dumped as JSON (only the keys the caller set)."""

    user_id: int
    name: str
    filters: dict[str, Any]


class JobSearchUpdateDTO(BaseModel):
    """A rename and/or new filters; ``None`` keeps the stored value."""

    user_id: int
    name: str | None = None
    filters: dict[str, Any] | None = None


class JobSearchDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    filters: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None
