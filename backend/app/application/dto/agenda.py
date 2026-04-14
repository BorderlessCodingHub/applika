from datetime import date, time

from pydantic import BaseModel, ConfigDict


class AgendaStepDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    step_id: int
    step_date: date
    step_name: str | None = None
    step_color: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    application_id: int
    company_name: str
    role: str
