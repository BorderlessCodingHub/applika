"""Unit tests for use cases that accept cycle_id filtering."""

from unittest.mock import AsyncMock

from app.application.use_cases.applications.list_applications import (
    ListApplicationsUseCase,
)
from app.application.use_cases.user_stats.get_general_statistics import (
    GeneralStatisticsUseCase,
)
from app.application.use_cases.user_stats.get_mode_stats import (
    GetModeStatsUseCase,
)
from app.application.use_cases.quinzenal_reports.list_reports import (
    ListReportsUseCase,
)
from tests.unit.conftest import make_application


# ---------------------------------------------------------------------------
# ListApplications with cycle_id
# ---------------------------------------------------------------------------

async def test_list_applications_passes_cycle_id():
    repo = AsyncMock()
    repo.get_all_by_user_id.return_value = [make_application()]

    uc = ListApplicationsUseCase(repo)
    result = await uc.execute(user_id=1, cycle_id=42)

    repo.get_all_by_user_id.assert_called_once_with(1, 42)
    assert len(result) == 1


async def test_list_applications_null_cycle():
    repo = AsyncMock()
    repo.get_all_by_user_id.return_value = []

    uc = ListApplicationsUseCase(repo)
    result = await uc.execute(user_id=1, cycle_id=None)

    repo.get_all_by_user_id.assert_called_once_with(1, None)
    assert result == []


# ---------------------------------------------------------------------------
# GeneralStatistics with cycle_id
# ---------------------------------------------------------------------------

async def test_general_stats_passes_cycle_id():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 5
    repo.count_applications_per_strict_step.return_value = [
        {'step_name': 'Offer', 'count': 1},
        {'step_name': 'Denied', 'count': 2},
    ]

    uc = GeneralStatisticsUseCase(repo)
    result = await uc.execute(user_id=1, cycle_id=99)

    repo.get_applications_count.assert_called_once_with(1, 99)
    repo.count_applications_per_strict_step.assert_called_once_with(1, 99)
    assert result.total_applications == 5
    assert result.offers == 1
    assert result.denials == 2


# ---------------------------------------------------------------------------
# ModeStats with cycle_id
# ---------------------------------------------------------------------------

async def test_mode_stats_passes_cycle_id():
    repo = AsyncMock()
    repo.count_applications_grouped_by_mode.return_value = [
        {'mode': 'active', 'count': 3},
        {'mode': 'passive', 'count': 2},
    ]

    uc = GetModeStatsUseCase(repo)
    result = await uc.execute(user_id=1, cycle_id=50)

    repo.count_applications_grouped_by_mode.assert_called_once_with(1, 50)
    assert result.active == 3
    assert result.passive == 2


# ---------------------------------------------------------------------------
# ListReports with cycle_id
# ---------------------------------------------------------------------------

async def test_list_reports_passes_cycle_id():
    repo = AsyncMock()
    repo.get_all_by_user_id.return_value = []

    uc = ListReportsUseCase(repo)
    result = await uc.execute(user_id=1, cycle_id=77)

    repo.get_all_by_user_id.assert_called_once_with(1, 77)
    assert result.current_day == 1
