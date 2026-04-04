from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_mode_stats import (
    GetModeStatsUseCase,
)


async def test_mode_stats_with_data():
    repo = AsyncMock()
    repo.count_applications_grouped_by_mode.return_value = [
        {'mode': 'active', 'count': 7},
        {'mode': 'passive', 'count': 3},
    ]

    use_case = GetModeStatsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.active == 7
    assert result.passive == 3


async def test_mode_stats_empty():
    repo = AsyncMock()
    repo.count_applications_grouped_by_mode.return_value = []

    use_case = GetModeStatsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.active == 0
    assert result.passive == 0


async def test_mode_stats_only_active():
    repo = AsyncMock()
    repo.count_applications_grouped_by_mode.return_value = [
        {'mode': 'active', 'count': 5},
    ]

    use_case = GetModeStatsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.active == 5
    assert result.passive == 0
