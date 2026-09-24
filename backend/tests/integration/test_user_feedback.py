"""Integration tests for KODI-021: linked users mentioned in feedback posts.

``DiscordFeedbackServiceDp`` is overridden with a recording fake
(``FakeDiscordFeedbackService``) so no test hits a real webhook.
``DISCORD_CLIENT_ID``/``DISCORD_CLIENT_SECRET`` stay unset for this whole
module: a server with no Discord OAuth app configured must still mention
linked users in webhook posts, since the mention feature is independent of
the account-link OAuth app.
"""

import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import envs
from app.core.crypto import encrypt_discord_token
from app.core.enums import DiscordConnectionStatus
from app.domain.models import DiscordConnectionModel
from app.main import app as main_app
from app.presentation.dependencies import get_discord_feedback_service
from tests import msg
from tests.base_db_setup import base_data


@pytest.fixture(autouse=True)
def _no_discord_oauth_app(monkeypatch):
    """Forces DISCORD_CLIENT_ID/SECRET unset for this whole module (T046): a
    server without a configured Discord OAuth app must still mention linked
    users, since the mention feature only needs the connection's
    ``discord_id``. ``DISCORD_TOKEN_ENCRYPTION_KEY`` is still set so
    ``_seed_connection`` can encrypt a refresh token for the seeded row."""
    monkeypatch.setattr(envs, 'DISCORD_CLIENT_ID', None)
    monkeypatch.setattr(envs, 'DISCORD_CLIENT_SECRET', None)
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )


class FakeDiscordFeedbackService:
    """Records ``mention_user_id`` and ``message`` instead of hitting a real
    webhook, so a test can assert the mention actually reached the posted
    content (T046) and not just the ``mention_user_id`` argument."""

    def __init__(self):
        self.calls: list[int | None] = []
        self.messages: list[str] = []

    async def post_report_message(
        self, message: str, mention_user_id: int | None = None
    ) -> tuple[bool, str | None]:
        self.calls.append(mention_user_id)
        self.messages.append(message)
        return True, None


def _override() -> FakeDiscordFeedbackService:
    fake = FakeDiscordFeedbackService()
    main_app.dependency_overrides[get_discord_feedback_service] = lambda: fake
    return fake


async def _link_discord(
    db_session: AsyncSession,
    discord_id: int,
    *,
    status: DiscordConnectionStatus = DiscordConnectionStatus.ACTIVE,
) -> None:
    from tests.integration.test_account_link_discord import _seed_connection

    await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=discord_id,
        status=status,
    )


async def test_linked_user_feedback_mentions_user(
    async_client: AsyncClient, db_session: AsyncSession
):
    fake = _override()
    await _link_discord(db_session, 555)

    response = await async_client.post(
        '/feedbacks', json={'score': 5, 'text': 'great'}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    assert fake.calls == [555], msg([555], fake.calls)
    header = fake.messages[0].splitlines()[0]
    assert header == (
        f'\U0001f4ac **USER FEEDBACK** - @{base_data()["user"].username} <@555>'
    ), msg('header ending in <@555>', header)


async def test_unlinked_user_feedback_mentions_nobody(
    async_client: AsyncClient, db_session: AsyncSession
):
    fake = _override()

    response = await async_client.post(
        '/feedbacks', json={'score': 4, 'text': None}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    assert fake.calls == [None], msg([None], fake.calls)
    header = fake.messages[0].splitlines()[0]
    assert header == (
        f'\U0001f4ac **USER FEEDBACK** - @{base_data()["user"].username}'
    ), msg('unlinked header with no mention', header)


async def test_needs_reconnect_user_feedback_still_mentions(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-041: the mention reads the connection in any status, not just
    ``active``."""
    fake = _override()
    await _link_discord(
        db_session, 555, status=DiscordConnectionStatus.NEEDS_RECONNECT
    )

    response = await async_client.post(
        '/feedbacks', json={'score': 5, 'text': 'still linked'}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    assert fake.calls == [555], msg([555], fake.calls)


async def test_feedback_after_unlink_carries_no_mention(
    async_client: AsyncClient, db_session: AsyncSession
):
    fake = _override()
    await _link_discord(db_session, 555)

    first = await async_client.post(
        '/feedbacks', json={'score': 5, 'text': 'first'}
    )
    assert first.status_code == 201, msg(201, first.status_code)

    delete_response = await async_client.delete('/auth/link/discord')
    assert delete_response.status_code == 200, msg(
        200, delete_response.status_code
    )

    second = await async_client.post(
        '/feedbacks', json={'score': 3, 'text': 'second'}
    )
    assert second.status_code == 201, msg(201, second.status_code)

    assert fake.calls == [555, None], msg([555, None], fake.calls)
    first_header = fake.messages[0].splitlines()[0]
    second_header = fake.messages[1].splitlines()[0]
    username = base_data()['user'].username
    assert first_header == f'\U0001f4ac **USER FEEDBACK** - @{username} <@555>'
    assert second_header == f'\U0001f4ac **USER FEEDBACK** - @{username}'


async def test_feedback_after_link_moved_to_another_user_carries_no_mention(
    async_client: AsyncClient, db_session: AsyncSession
):
    """T101/R-008: once another user completes consent for the same
    Discord id, the previous holder's connection row is gone, so their
    feedback carries no mention any more - the mention read
    (``DiscordConnectionRepositoryDp``) is fresh per request, not cached."""
    from app.domain.repositories.discord_connection_repository import (
        DiscordConnectionRepository,
    )

    fake = _override()
    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id
    await _link_discord(db_session, 555)

    # B completes consent for the same Discord id: the link transfers.
    conn_repo = DiscordConnectionRepository(db_session)
    await conn_repo.link(
        user_id=user_b_id,
        discord_id=555,
        username='bea',
        global_name=None,
        avatar=None,
        scopes='identify guilds guilds.members.read',
        encrypted_refresh_token=encrypt_discord_token('b-refresh')
        or 'unreachable',
        access_token_expires_at=None,
    )

    connection_a = await db_session.scalar(
        select(DiscordConnectionModel)
        .where(DiscordConnectionModel.user_id == user_a_id)
        .execution_options(populate_existing=True)
    )
    assert connection_a is None

    response = await async_client.post(
        '/feedbacks', json={'score': 2, 'text': 'lost my link'}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    assert fake.calls == [None], msg([None], fake.calls)
    header = fake.messages[0].splitlines()[0]
    assert header == (
        f'\U0001f4ac **USER FEEDBACK** - @{base_data()["user"].username}'
    ), msg('previous holder header with no mention', header)
