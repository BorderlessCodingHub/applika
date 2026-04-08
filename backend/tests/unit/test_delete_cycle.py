import pytest
from unittest.mock import AsyncMock

from app.application.use_cases.cycles.delete_cycle import DeleteCycleUseCase
from app.core.exceptions import ResourceNotFound
from tests.unit.conftest import make_cycle


@pytest.mark.asyncio
async def test_delete_cycle_success():
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = make_cycle(
        id=42, name='Old Cycle'
    )

    uc = DeleteCycleUseCase(repo)
    await uc.execute(cycle_id=42, user_id=1)

    repo.get_by_id_and_user_id.assert_called_once_with(42, 1)
    repo.delete_cycle_cascade.assert_called_once_with(42, 1)


@pytest.mark.asyncio
async def test_delete_cycle_not_found_raises():
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = None

    uc = DeleteCycleUseCase(repo)

    with pytest.raises(ResourceNotFound, match='not found'):
        await uc.execute(cycle_id=999, user_id=1)

    repo.delete_cycle_cascade.assert_not_called()


@pytest.mark.asyncio
async def test_delete_cycle_wrong_user_raises():
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = None

    uc = DeleteCycleUseCase(repo)

    with pytest.raises(ResourceNotFound):
        await uc.execute(cycle_id=42, user_id=999)

    repo.delete_cycle_cascade.assert_not_called()
