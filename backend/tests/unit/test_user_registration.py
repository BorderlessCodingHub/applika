"""Unit tests for ``UserRegistrationUseCase`` (KODI-026 backend-qa B5).

A returning user must never fail login because GitHub's OpenID response
carries ``email=None`` or ``display_name=None`` for that request (GitHub's
own ``/user/emails`` can answer non-200, and ``fastapi_sso`` falls back to
``None`` rather than raising) - those two fields are only ever read again
on a brand-new user, never on an existing one.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi_sso import OpenID

from app.application.use_cases.user_registration import (
    UserRegistrationUseCase,
)
from tests.unit.conftest import make_user


@pytest.mark.asyncio
async def test_returning_user_login_survives_missing_email_and_name():
    existing_user = make_user(
        id=1, github_id=123, username='ada', email='ada@example.com'
    )
    repo = AsyncMock()
    repo.get_by_github_id.return_value = existing_user
    repo.update.side_effect = lambda updated_user: updated_user

    use_case = UserRegistrationUseCase(repo)
    openid_user = OpenID(
        id='123', display_name=None, email=None, provider='github'
    )

    result = await use_case.execute(openid_user, github_token=None)

    assert result.id == existing_user.id
    repo.update.assert_awaited_once()


@pytest.mark.asyncio
async def test_new_user_without_email_raises_before_create():
    repo = AsyncMock()
    repo.get_by_github_id.return_value = None

    use_case = UserRegistrationUseCase(repo)
    openid_user = OpenID(
        id='123', display_name='ada', email=None, provider='github'
    )

    with pytest.raises(AssertionError):
        await use_case.execute(openid_user, github_token=None)

    repo.create.assert_not_awaited()
