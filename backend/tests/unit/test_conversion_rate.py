from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_conversion_rate import (
    UserConversionRateUseCase,
)


async def test_conversion_rate_with_data():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 10
    repo.count_applications_per_step.return_value = [
        {
            'step_id': 1,
            'step_name': 'Applied',
            'step_color': '#007bff',
            'count': 10,
        },
        {
            'step_id': 2,
            'step_name': 'Interview',
            'step_color': '#17a2b8',
            'count': 5,
        },
    ]

    use_case = UserConversionRateUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert len(result) == 2
    assert result[0].conversion_rate == 100.0
    assert result[1].conversion_rate == 50.0


async def test_conversion_rate_empty():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 0
    repo.count_applications_per_step.return_value = []

    use_case = UserConversionRateUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result == []


async def test_conversion_rate_zero_total():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 0
    repo.count_applications_per_step.return_value = [
        {
            'step_id': 1,
            'step_name': 'Applied',
            'step_color': '#007bff',
            'count': 0,
        },
    ]

    use_case = UserConversionRateUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result[0].conversion_rate == 0
