import pytest
from unittest.mock import AsyncMock

from app.application.dto.cycle import CycleCreateDTO
from app.application.use_cases.cycles.create_cycle import CreateCycleUseCase
from app.core.exceptions import BusinessRuleViolation
from tests.unit.conftest import make_cycle


async def test_create_cycle_archives_and_commits():
    repo = AsyncMock()
    repo.count_current_applications.return_value = 15
    repo.create.return_value = make_cycle(id=42, name='Q1 2026')
    repo.archive_current_applications.return_value = 15
    repo.archive_current_reports.return_value = 3

    uc = CreateCycleUseCase(repo)
    result = await uc.execute(
        user_id=1, data=CycleCreateDTO(name='Q1 2026')
    )

    repo.create.assert_called_once_with(1, 'Q1 2026')
    repo.archive_current_applications.assert_called_once_with(1, 42)
    repo.archive_current_reports.assert_called_once_with(1, 42)
    repo.commit.assert_called_once()
    assert result.name == 'Q1 2026'


async def test_create_cycle_rejected_below_minimum():
    repo = AsyncMock()
    repo.count_current_applications.return_value = 5

    uc = CreateCycleUseCase(repo)
    with pytest.raises(BusinessRuleViolation, match='At least 10'):
        await uc.execute(
            user_id=1, data=CycleCreateDTO(name='Too Early')
        )

    repo.create.assert_not_called()


async def test_create_cycle_at_exact_minimum():
    repo = AsyncMock()
    repo.count_current_applications.return_value = 10
    repo.create.return_value = make_cycle(name='Exact')
    repo.archive_current_applications.return_value = 10
    repo.archive_current_reports.return_value = 0

    uc = CreateCycleUseCase(repo)
    result = await uc.execute(
        user_id=1, data=CycleCreateDTO(name='Exact')
    )

    repo.commit.assert_called_once()
    assert result.name == 'Exact'
