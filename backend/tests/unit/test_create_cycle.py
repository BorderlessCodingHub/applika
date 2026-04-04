from unittest.mock import AsyncMock

from app.application.dto.cycle import CycleCreateDTO
from app.application.use_cases.cycles.create_cycle import CreateCycleUseCase
from tests.unit.conftest import make_cycle


async def test_create_cycle_archives_and_commits():
    repo = AsyncMock()
    repo.create.return_value = make_cycle(id=42, name='Q1 2026')
    repo.archive_current_applications.return_value = 5
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


async def test_create_cycle_empty_state():
    repo = AsyncMock()
    repo.create.return_value = make_cycle(name='Empty')
    repo.archive_current_applications.return_value = 0
    repo.archive_current_reports.return_value = 0

    uc = CreateCycleUseCase(repo)
    result = await uc.execute(
        user_id=1, data=CycleCreateDTO(name='Empty')
    )

    repo.commit.assert_called_once()
    assert result.name == 'Empty'
