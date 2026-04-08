from unittest.mock import AsyncMock

import pytest

from app.application.dto.user import UserUpdateDTO
from app.application.use_cases.update_user import UpdateUserUseCase
from app.core.exceptions import ResourceNotFound
from tests.unit.conftest import make_user


async def test_update_user_not_found():
    repo = AsyncMock()
    repo.get_by_id.return_value = None

    uc = UpdateUserUseCase(repo)

    with pytest.raises(ResourceNotFound, match='User not found'):
        await uc.execute(user_id=999, data=UserUpdateDTO(first_name='X'))


async def test_update_user_partial():
    repo = AsyncMock()
    user = make_user()
    repo.get_by_id.return_value = user
    repo.update.return_value = user

    uc = UpdateUserUseCase(repo)
    await uc.execute(
        user_id=1,
        data=UserUpdateDTO(first_name='Jane', location='Berlin'),
    )

    assert user.first_name == 'Jane'
    assert user.location == 'Berlin'
    repo.update.assert_called_once()


async def test_update_user_tech_stack():
    repo = AsyncMock()
    user = make_user()
    repo.get_by_id.return_value = user
    repo.update.return_value = user

    uc = UpdateUserUseCase(repo)
    await uc.execute(
        user_id=1,
        data=UserUpdateDTO(tech_stack=['Python', 'Go']),
    )

    assert user.tech_stack == ['Python', 'Go']


async def test_update_user_none_experience_defaults_to_zero():
    repo = AsyncMock()
    user = make_user()
    repo.get_by_id.return_value = user
    repo.update.return_value = user

    uc = UpdateUserUseCase(repo)
    await uc.execute(
        user_id=1,
        data=UserUpdateDTO(experience_years=None, current_salary=None),
    )

    repo.update.assert_called_once()
