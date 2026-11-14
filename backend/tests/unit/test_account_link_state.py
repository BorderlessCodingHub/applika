from unittest.mock import AsyncMock

import pytest

from app.application.use_cases.account_link_state import (
    AccountLinkStateUseCase,
)
from app.config.settings import envs


@pytest.mark.asyncio
async def test_create_sets_key_with_ttl_and_prefix():
    redis_client = AsyncMock()
    use_case = AccountLinkStateUseCase(redis_client)

    nonce = await use_case.create(user_id=42)

    redis_client.set.assert_called_once()
    key, value = redis_client.set.call_args.args
    assert key == f'applika:account_link:github_restore:{nonce}'
    assert value == '42'
    assert redis_client.set.call_args.kwargs['ex'] == (
        envs.ACCOUNT_LINK_STATE_TTL_SECONDS
    )


@pytest.mark.asyncio
async def test_consume_returns_user_id():
    redis_client = AsyncMock()
    redis_client.getdel.return_value = '7'
    use_case = AccountLinkStateUseCase(redis_client)

    result = await use_case.consume('some-nonce')

    assert result == 7
    redis_client.getdel.assert_called_once_with(
        'applika:account_link:github_restore:some-nonce'
    )


@pytest.mark.asyncio
async def test_consume_is_single_use():
    """GETDEL means a second consume of the same nonce finds nothing."""
    redis_client = AsyncMock()
    redis_client.getdel.side_effect = ['7', None]
    use_case = AccountLinkStateUseCase(redis_client)

    first = await use_case.consume('some-nonce')
    second = await use_case.consume('some-nonce')

    assert first == 7
    assert second is None
