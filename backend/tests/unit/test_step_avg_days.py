from decimal import Decimal
from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_step_avg_days import (
    GetAvgDaysPerStepUseCase,
    format_decimal,
)


def test_format_decimal():
    assert format_decimal(Decimal('3.456')) == Decimal('3.5')
    assert format_decimal(Decimal('3.44')) == Decimal('3.4')
    assert format_decimal(Decimal('0')) == Decimal('0.0')
    assert format_decimal(Decimal('10.05')) == Decimal('10.1')


async def test_avg_days_per_step():
    repo = AsyncMock()
    repo.average_days_per_step.return_value = [
        {
            'step_id': 1,
            'step_name': 'Applied',
            'step_color': '#007bff',
            'avg_days': Decimal('5.3'),
        },
        {
            'step_id': 2,
            'step_name': 'Interview',
            'step_color': '#17a2b8',
            'avg_days': Decimal('12.7'),
        },
    ]

    use_case = GetAvgDaysPerStepUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert len(result) == 2
    assert result[0].average_days == Decimal('5.3')
    assert result[1].average_days == Decimal('12.7')


async def test_avg_days_empty():
    repo = AsyncMock()
    repo.average_days_per_step.return_value = []

    use_case = GetAvgDaysPerStepUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result == []
