from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_platform_stats import (
    GetPlatformStatsUseCase,
)


async def test_platform_stats():
    repo = AsyncMock()
    repo.count_applications_grouped_by_platform.return_value = [
        {'platform_id': 1, 'platform_name': 'LinkedIn', 'count': 10},
        {'platform_id': 2, 'platform_name': 'Indeed', 'count': 5},
    ]

    use_case = GetPlatformStatsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert len(result) == 2
    assert result[0].name == 'LinkedIn'
    assert result[0].total_applications == 10
    assert result[1].name == 'Indeed'
    assert result[1].total_applications == 5


async def test_platform_stats_empty():
    repo = AsyncMock()
    repo.count_applications_grouped_by_platform.return_value = []

    use_case = GetPlatformStatsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result == []
