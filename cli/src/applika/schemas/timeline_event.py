import datetime

from pydantic import BaseModel, model_validator
from typing_extensions import TypedDict

from applika.schemas.enums import (
    Currency,
    EventType,
    InterviewType,
    OfferPeriod,
)


def _parse_time(value: str) -> datetime.time:
    return datetime.time.fromisoformat(value)


class _TimelineEventBase(BaseModel):
    event_type: EventType
    interview_type: InterviewType | None = None
    event_date: datetime.date
    start_time: str | None = None
    end_time: str | None = None
    timezone: str | None = None
    observation: str | None = None
    salary_amount: float | None = None
    salary_currency: Currency | None = None
    salary_period: OfferPeriod | None = None

    @model_validator(mode='after')
    def validate_time_range(self) -> '_TimelineEventBase':
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

    @model_validator(mode='after')
    def validate_interview_type(self) -> '_TimelineEventBase':
        if self.event_type is EventType.INTERVIEW:
            if self.interview_type is None:
                self.interview_type = InterviewType.UNKNOWN
        elif self.interview_type is not None:
            raise ValueError(
                '--interview-type is only allowed with --type interview'
            )
        return self

    @model_validator(mode='after')
    def validate_offer_salary(self) -> '_TimelineEventBase':
        salary_fields = (
            self.salary_amount,
            self.salary_currency,
            self.salary_period,
        )
        if self.event_type is EventType.OFFER:
            if any(field is None for field in salary_fields):
                raise ValueError(
                    '--salary, --currency and --period are required with '
                    '--type offer'
                )
        elif any(field is not None for field in salary_fields):
            raise ValueError(
                '--salary, --currency and --period are only allowed with '
                '--type offer'
            )
        return self


class TimelineEventCreate(_TimelineEventBase): ...


class TimelineEventUpdate(_TimelineEventBase): ...


class TimelineEventEntry(TypedDict):
    id: str
    application_id: str
    user_id: str
    event_type: str
    interview_type: str | None
    event_date: str
    start_time: str | None
    end_time: str | None
    timezone: str | None
    observation: str | None
    salary_amount: str | None
    salary_currency: str | None
    salary_period: str | None
    created_at: str
    updated_at: str | None
