"""``EndBorderlessGrantUseCase`` (ADR-0026 §9): Borderless refused the
grant. Every open web session ends ``borderless_revoked``, CLI sessions
stay open, the refresh token is forgotten, the binding becomes
``needs_reconnect`` and the Redis access token goes."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.application.services.session_store import LiveSession
from app.application.use_cases.borderless.end_grant import (
    EndBorderlessGrantUseCase,
)
from app.domain.models import BorderlessAccountModel, UserSessionModel
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)
from tests.base_db_setup import base_data
from tests.conftest import MemoryAccessStore, bind_borderless

USER_ID = base_data()['user'].id


class LiveStore:
    """Every session is live in Redis; ``ended`` records the DELs."""

    def __init__(self) -> None:
        self.ended: list[int] = []

    async def live(self, session_id: int) -> LiveSession:
        return LiveSession(alive=session_id not in self.ended)

    async def end(self, session_id: int) -> None:
        self.ended.append(session_id)


async def _session(db_session, row_id: int, client_type: str, ended=False):
    now = datetime.now(UTC)
    db_session.add(
        UserSessionModel(
            id=row_id,
            user_id=USER_ID,
            client_type=client_type,
            sign_in_method='borderless' if client_type == 'web' else 'cli_browser',
            device_name='device',
            expires_at=now + timedelta(days=7),
            ended_at=now if ended else None,
            end_reason='logout' if ended else None,
        )
    )
    await db_session.commit()


async def _row(db_session, row_id: int) -> UserSessionModel:
    row = await db_session.get(UserSessionModel, row_id)
    assert row is not None
    await db_session.refresh(row)
    return row


async def test_web_sessions_end_cli_sessions_stay_and_the_grant_goes(
    db_session,
):
    await bind_borderless(db_session, USER_ID)
    await _session(db_session, 9001, 'web')
    await _session(db_session, 9002, 'web')
    await _session(db_session, 9003, 'cli')
    await _session(db_session, 9004, 'web', ended=True)
    store = LiveStore()
    access = MemoryAccessStore()
    await access.put(USER_ID, 'access', 3600)

    ended = await EndBorderlessGrantUseCase(
        db_session, UserSessionRepository(db_session), store, access  # ty: ignore[invalid-argument-type]
    ).execute(USER_ID)

    assert ended == 2
    assert sorted(store.ended) == [9001, 9002]
    for row_id in (9001, 9002):
        row = await _row(db_session, row_id)
        assert row.end_reason == 'borderless_revoked'
        assert row.ended_at is not None
    cli = await _row(db_session, 9003)
    assert cli.ended_at is None
    assert (await _row(db_session, 9004)).end_reason == 'logout'
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == USER_ID
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    assert binding.encrypted_refresh_token is None
    assert binding.status == 'needs_reconnect'
    assert access.tokens == {}


async def test_no_binding_still_ends_the_web_sessions(db_session):
    await _session(db_session, 9001, 'web')
    store = LiveStore()

    ended = await EndBorderlessGrantUseCase(
        db_session,
        UserSessionRepository(db_session),
        store,  # ty: ignore[invalid-argument-type]
        MemoryAccessStore(),
    ).execute(USER_ID)

    assert ended == 1
