from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_general_statistics import (
    GeneralStatisticsUseCase,
)


async def test_general_stats_with_data():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 10
    repo.count_applications_per_strict_step.return_value = [
        {'step_name': 'Offer', 'count': 2},
        {'step_name': 'Denied', 'count': 3},
    ]

    use_case = GeneralStatisticsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.total_applications == 10
    assert result.offers == 2
    assert result.denials == 3
    assert result.success_rate == 20.0


async def test_general_stats_empty():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 0
    repo.count_applications_per_strict_step.return_value = []

    use_case = GeneralStatisticsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.total_applications == 0
    assert result.offers == 0
    assert result.denials == 0
    assert result.success_rate == 0


async def test_general_stats_with_cycle_id():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 5
    repo.count_applications_per_strict_step.return_value = [
        {'step_name': 'Offer', 'count': 1},
    ]

    use_case = GeneralStatisticsUseCase(repo)
    result = await use_case.execute(user_id=1, cycle_id=42)

    repo.get_applications_count.assert_called_with(1, 42)
    repo.count_applications_per_strict_step.assert_called_with(1, 42)
    assert result.total_applications == 5
    assert result.offers == 1
