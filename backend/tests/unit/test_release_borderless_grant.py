"""``ReleaseBorderlessGrantUseCase`` (ADR-0026 §10): when the user's last
open session ends (or the account goes), the refresh token is forgotten
and handed back for revocation, and the access token goes. While another
session is open nothing happens."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.application.use_cases.borderless.release_grant import (
    ReleaseBorderlessGrantUseCase,
)
from app.domain.models import BorderlessAccountModel, UserSessionModel
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)
from tests.base_db_setup import base_data
from tests.conftest import MemoryAccessStore, bind_borderless

USER_ID = base_data()['user'].id


async def _open_session(db_session, row_id: int, expires=timedelta(days=7)):
    db_session.add(
        UserSessionModel(
            id=row_id,
            user_id=USER_ID,
            client_type='cli',
            sign_in_method='cli_browser',
            device_name='device',
            expires_at=datetime.now(UTC) + expires,
        )
    )
    await db_session.commit()


async def _token(db_session) -> str | None:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == USER_ID
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    return binding.encrypted_refresh_token


def release(db_session, access) -> ReleaseBorderlessGrantUseCase:
    return ReleaseBorderlessGrantUseCase(
        db_session, UserSessionRepository(db_session), access
    )


async def test_the_last_session_releases_the_grant(db_session):
    await bind_borderless(db_session, USER_ID, token='refresh-1')
    access = MemoryAccessStore()
    await access.put(USER_ID, 'access', 3600)

    token = await release(db_session, access).execute(USER_ID)

    assert token == 'refresh-1'
    assert await _token(db_session) is None
    assert access.tokens == {}


async def test_another_open_session_keeps_the_grant(db_session):
    await bind_borderless(db_session, USER_ID, token='refresh-1')
    await _open_session(db_session, 9001)
    access = MemoryAccessStore()
    await access.put(USER_ID, 'access', 3600)

    assert await release(db_session, access).execute(USER_ID) is None
    assert await _token(db_session) is not None
    assert USER_ID in access.tokens


async def test_a_session_past_its_end_does_not_count(db_session):
    await bind_borderless(db_session, USER_ID, token='refresh-1')
    await _open_session(db_session, 9001, expires=-timedelta(seconds=1))

    token = await release(db_session, MemoryAccessStore()).execute(USER_ID)
    assert token == 'refresh-1'


async def test_force_releases_even_with_open_sessions(db_session):
    await bind_borderless(db_session, USER_ID, token='refresh-1')
    await _open_session(db_session, 9001)

    token = await release(db_session, MemoryAccessStore()).execute(
        USER_ID, force=True
    )

    assert token == 'refresh-1'
    assert await _token(db_session) is None


async def test_no_binding_or_no_token_releases_nothing(db_session):
    assert await release(db_session, MemoryAccessStore()).execute(USER_ID) is None
    await bind_borderless(db_session, USER_ID, token='')
    assert await release(db_session, MemoryAccessStore()).execute(USER_ID) is None
