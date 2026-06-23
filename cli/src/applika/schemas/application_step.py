import datetime

from pydantic import BaseModel, model_validator
from typing_extensions import TypedDict


def _parse_time(value: str) -> datetime.time:
    return datetime.time.fromisoformat(value)


class _ApplicationStepBase(BaseModel):
    step_id: str
    step_date: datetime.date
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    observation: str | None = None

    @model_validator(mode='after')
    def validate_time_range(self) -> '_ApplicationStepBase':
        if bool(self.start_time) != bool(self.end_time):
            raise ValueError(
                'start-time and end-time must be provided together'
            )
        if (
            self.start_time is not None
            and self.end_time is not None
            and _parse_time(self.end_time) <= _parse_time(self.start_time)
        ):
            raise ValueError('end-time must be after start-time')
        return self


class ApplicationStepCreate(_ApplicationStepBase): ...


class ApplicationStepUpdate(_ApplicationStepBase): ...


class ApplicationStepEntry(TypedDict):
    id: str
    step_id: str
    step_name: str | None
    step_date: str
    start_time: str | None
    end_time: str | None
    timezone: str | None
    observation: str | None


class FinalizeApplication(BaseModel):
    step_id: str
    feedback_id: str
    finalize_date: datetime.date
    salary_offer: float | None = None
    observation: str | None = None
