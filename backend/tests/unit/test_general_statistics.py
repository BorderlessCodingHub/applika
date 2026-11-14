"""GeneralStatisticsUseCase on the timeline (R-022).

Offers and denials are applications with at least one offer or denied
event, taken from the per-stage distinct-application counts; the success
rate is offers over all applications.
"""

from unittest.mock import AsyncMock

from app.application.use_cases.user_stats.get_general_statistics import (
    GeneralStatisticsUseCase,
)
from app.core.enums import EventType, InterviewType


async def test_general_stats_with_data():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 10
    repo.count_applications_per_stage.return_value = {
        (EventType.OFFER, None): 2,
        (EventType.DENIED, None): 3,
        (EventType.INTERVIEW, InterviewType.TECHNICAL): 6,
        (EventType.INTERVIEW, InterviewType.UNKNOWN): 9,
    }
    repo.get_active_applications_count.return_value = 7

    use_case = GeneralStatisticsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.total_applications == 10
    assert result.offers == 2
    assert result.denials == 3
    assert result.success_rate == 20.0
    assert result.active == 7


async def test_general_stats_empty():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 0
    repo.count_applications_per_stage.return_value = {}
    repo.get_active_applications_count.return_value = 0

    use_case = GeneralStatisticsUseCase(repo)
    result = await use_case.execute(user_id=1)

    assert result.total_applications == 0
    assert result.offers == 0
    assert result.denials == 0
    assert result.success_rate == 0
    assert result.active == 0


async def test_general_stats_with_cycle_id():
    repo = AsyncMock()
    repo.get_applications_count.return_value = 5
    repo.count_applications_per_stage.return_value = {
        (EventType.OFFER, None): 1,
    }
    repo.get_active_applications_count.return_value = 4

    use_case = GeneralStatisticsUseCase(repo)
    result = await use_case.execute(user_id=1, cycle_id=42)

    repo.get_applications_count.assert_called_with(1, 42)
    repo.count_applications_per_stage.assert_called_with(1, 42)
    repo.get_active_applications_count.assert_called_with(1, 42)
    assert result.total_applications == 5
    assert result.offers == 1
    assert result.denials == 0
    assert result.success_rate == 20.0
    assert result.active == 4


async def test_general_stats_active_excludes_closed_regardless_of_outcome():
    """AC23: ``active`` is forwarded from the repository independent of
    offers/denials (a mocked repo can't prove the ``finalized_at IS NULL``
    rule itself — that's ``test_active_count_...`` in test_statistics.py),
    so an application counted for both offers and denials does not bump
    ``active`` alongside them."""
    repo = AsyncMock()
    repo.get_applications_count.return_value = 3
    repo.count_applications_per_stage.return_value = {
        (EventType.OFFER, None): 1,
        (EventType.DENIED, None): 1,
    }
    repo.get_active_applications_count.return_value = 1

    result = await GeneralStatisticsUseCase(repo).execute(user_id=1)

    assert result.active == 1
    assert (result.offers, result.denials) == (1, 1)


async def test_general_stats_offer_and_denied_on_one_application_count_both():
    """R-022: counted independently, no Offer <-> Accepted coupling."""
    repo = AsyncMock()
    repo.get_applications_count.return_value = 1
    repo.count_applications_per_stage.return_value = {
        (EventType.OFFER, None): 1,
        (EventType.DENIED, None): 1,
    }
    repo.get_active_applications_count.return_value = 0

    result = await GeneralStatisticsUseCase(repo).execute(user_id=1)

    assert (result.offers, result.denials) == (1, 1)
    assert result.success_rate == 100.0
