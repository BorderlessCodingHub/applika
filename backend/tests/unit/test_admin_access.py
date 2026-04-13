import pytest

from app.core.exceptions import ForbiddenAccess
from app.presentation.dependencies import get_admin_user
from tests.unit.conftest import make_user


async def test_admin_user_passes():
    """Admin users should pass the guard without exception."""
    user_dto = _make_user_dto(is_admin=True)
    result = await get_admin_user(user_dto)
    assert result.is_admin is True
    assert result.id == user_dto.id


async def test_non_admin_user_raises_forbidden():
    """Non-admin users should get ForbiddenAccess."""
    user_dto = _make_user_dto(is_admin=False)
    with pytest.raises(ForbiddenAccess):
        await get_admin_user(user_dto)


async def test_admin_default_is_false():
    """UserDTO defaults to is_admin=False, so guard should reject."""
    user_dto = _make_user_dto()
    with pytest.raises(ForbiddenAccess):
        await get_admin_user(user_dto)


def _make_user_dto(**kwargs):
    from app.application.dto.user import UserDTO

    fake = make_user(**kwargs)
    return UserDTO.model_validate(fake, from_attributes=True)
