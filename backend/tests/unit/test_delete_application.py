from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.use_cases.applications.delete_application import (
    DeleteApplicationUseCase,
)
from app.core.exceptions import BusinessRuleViolation, ResourceNotFound


async def test_delete_application_not_found():
    app_repo = AsyncMock()
    step_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = None

    use_case = DeleteApplicationUseCase(app_repo, step_repo)

    with pytest.raises(ResourceNotFound):
        await use_case.execute(id=999, user_id=1)


async def test_delete_application_archived_cycle():
    app_repo = AsyncMock()
    step_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = MagicMock(
        id=1, cycle_id=42
    )

    use_case = DeleteApplicationUseCase(app_repo, step_repo)

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await use_case.execute(id=1, user_id=1)

    step_repo.delete_all_by_application_id.assert_not_called()


async def test_delete_application_success():
    app_repo = AsyncMock()
    step_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = MagicMock(
        id=1, cycle_id=None
    )

    use_case = DeleteApplicationUseCase(app_repo, step_repo)
    await use_case.execute(id=1, user_id=1)

    step_repo.delete_all_by_application_id.assert_called_once_with(1)
    app_repo.delete_by_id.assert_called_once_with(1)
