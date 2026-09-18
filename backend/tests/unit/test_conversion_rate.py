"""UserConversionRateUseCase per stage (R-023).

A stage is each interview type, offer and denied: always nine rows, in the
fixed order interview x 7 (InterviewType order), offer, denied.
"""

from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_conversion_rate import (
    UserConversionRateUseCase,
)
from app.application.use_cases.user_stats.stages import STAGES
from app.core.enums import EventType, InterviewType

EXPECTED_ORDER = [
    ('interview', 'unknown'),
    ('interview', 'initial_screening'),
    ('interview', 'technical'),
    ('interview', 'cultural'),
    ('interview', 'hiring_manager'),
    ('interview', 'take_home'),
    ('interview', 'final'),
    ('offer', None),
    ('denied', None),
]


def test_stages_are_the_nine_fixed_ones_in_order():
    assert [
        (event_type.value, interview_type and interview_type.value)
        for event_type, interview_type in STAGES
    ] == EXPECTED_ORDER


async def test_conversion_rate_with_data():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 10
    repo.count_applications_per_stage.return_value = {
        (EventType.INTERVIEW, InterviewType.INITIAL_SCREENING): 5,
        (EventType.INTERVIEW, InterviewType.TECHNICAL): 2,
        (EventType.OFFER, None): 1,
        # Notes and feedback are not stages.
        (EventType.NOTE, None): 10,
    }

    use_case = UserConversionRateUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert [
        (r.event_type.value, r.interview_type and r.interview_type.value)
        for r in result
    ] == EXPECTED_ORDER
    by_stage = {(r.event_type, r.interview_type): r for r in result}
    screening = by_stage[(EventType.INTERVIEW, InterviewType.INITIAL_SCREENING)]
    assert screening.total_applications == 5
    assert screening.conversion_rate == 50.0
    assert by_stage[(EventType.OFFER, None)].conversion_rate == 10.0
    assert by_stage[(EventType.DENIED, None)].total_applications == 0
    assert by_stage[(EventType.DENIED, None)].conversion_rate == 0


async def test_conversion_rate_empty_still_lists_every_stage():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 0
    repo.count_applications_per_stage.return_value = {}

    use_case = UserConversionRateUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert len(result) == 9
    assert all(r.total_applications == 0 for r in result)
    assert all(r.conversion_rate == 0 for r in result)


async def test_conversion_rate_rounds_to_one_decimal_and_passes_cycle():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 3
    repo.count_applications_per_stage.return_value = {
        (EventType.DENIED, None): 1,
    }

    result = await UserConversionRateUseCase(repo).execute(
        user_id=1, cycle_id=7
    )

    repo.count_applications_per_stage.assert_called_once_with(1, 7)
    assert result[-1].conversion_rate == 33.3
