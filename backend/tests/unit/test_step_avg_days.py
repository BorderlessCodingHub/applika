"""GetAvgDaysPerStepUseCase per stage (R-023)."""

from decimal import Decimal
from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_step_avg_days import (
    GetAvgDaysPerStepUseCase,
    format_decimal,
)
from app.core.enums import EventType, InterviewType


def test_format_decimal():
    assert format_decimal(Decimal('3.456')) == Decimal('3.5')
    assert format_decimal(Decimal('3.44')) == Decimal('3.4')
    assert format_decimal(Decimal('0')) == Decimal('0.0')
    assert format_decimal(Decimal('10.05')) == Decimal('10.1')


async def test_avg_days_per_stage():
    repo = AsyncMock()
    repo.average_days_per_stage.return_value = {
        (EventType.INTERVIEW, InterviewType.CULTURAL): Decimal('5.34'),
        (EventType.OFFER, None): Decimal('12.66'),
        (EventType.INTERVIEW, InterviewType.UNKNOWN): Decimal('99'),
    }

    use_case = GetAvgDaysPerStepUseCase(repo)
    result = await use_case.execute(user_id=1, cycle_id=3)

    repo.average_days_per_stage.assert_called_once_with(1, 3)
    assert len(result) == 9
    by_stage = {(r.event_type, r.interview_type): r for r in result}
    assert by_stage[
        (EventType.INTERVIEW, InterviewType.CULTURAL)
    ].average_days == Decimal('5.3')
    assert by_stage[(EventType.OFFER, None)].average_days == Decimal('12.7')
    assert by_stage[(EventType.DENIED, None)].average_days == Decimal('0.0')
    # A former note or feedback is an interview of type unknown (ADR-0020).
    assert by_stage[
        (EventType.INTERVIEW, InterviewType.UNKNOWN)
    ].average_days == Decimal('99.0')
    assert result[-2].event_type is EventType.OFFER
    assert result[-1].event_type is EventType.DENIED


async def test_avg_days_empty_lists_every_stage_at_zero():
    repo = AsyncMock()
    repo.average_days_per_stage.return_value = {}

    use_case = GetAvgDaysPerStepUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert len(result) == 9
    assert {r.average_days for r in result} == {Decimal('0.0')}
