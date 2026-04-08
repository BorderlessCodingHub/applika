from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import jwt
import pytest
from fastapi import HTTPException

from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.settings import envs
from tests.unit.conftest import make_user


def _make_token(sub: str, expired: bool = False) -> str:
    exp = datetime.now(timezone.utc) + (
        timedelta(minutes=-5) if expired else timedelta(minutes=15)
    )
    return jwt.encode(
        {'sub': sub, 'kind': 'access', 'exp': exp},
        envs.JWT_SECRET,
        algorithm=envs.JWT_ALGORITHM,
    )


async def test_no_token_raises_401():
    uc = GetCurrentUserUseCase(AsyncMock())
    with pytest.raises(HTTPException) as exc_info:
        await uc.execute(None)
    assert exc_info.value.status_code == 401


async def test_empty_token_raises_401():
    uc = GetCurrentUserUseCase(AsyncMock())
    with pytest.raises(HTTPException) as exc_info:
        await uc.execute('')
    assert exc_info.value.status_code == 401


async def test_invalid_token_raises_401():
    uc = GetCurrentUserUseCase(AsyncMock())
    with pytest.raises(HTTPException) as exc_info:
        await uc.execute('invalid.jwt.token')
    assert exc_info.value.status_code == 401


async def test_expired_token_raises_401():
    uc = GetCurrentUserUseCase(AsyncMock())
    token = _make_token('12345', expired=True)
    with pytest.raises(HTTPException) as exc_info:
        await uc.execute(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Token expired'


async def test_token_without_sub_raises_401():
    uc = GetCurrentUserUseCase(AsyncMock())
    token = jwt.encode(
        {
            'kind': 'access',
            'exp': datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        envs.JWT_SECRET,
        algorithm=envs.JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc_info:
        await uc.execute(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Invalid token payload'


async def test_valid_token_user_not_found():
    repo = AsyncMock()
    repo.get_by_github_id.return_value = None

    uc = GetCurrentUserUseCase(repo)
    with pytest.raises(HTTPException) as exc_info:
        await uc.execute(_make_token('12345'))
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'User not found'


async def test_valid_token_returns_user():
    repo = AsyncMock()
    repo.get_by_github_id.return_value = make_user(github_id=12345)

    uc = GetCurrentUserUseCase(repo)
    result = await uc.execute(_make_token('12345'))

    assert result.id == 1
    assert result.username == 'testuser'
    repo.get_by_github_id.assert_called_once_with(12345)
