"""Open a REAL device session in tests (KODI-057, ADR-0019, plan
correction 3).

Since KODI-057 ``get_current_user`` needs a live session: an access JWT
whose ``sid`` names a ``user_sessions`` row with its Redis keys. Tests that
send a real ``__access`` cookie or Bearer token (instead of overriding
``get_current_user``) open one here, through the app's own
``OpenSessionUseCase``, on the ``redis_client`` fixture's Redis.
"""

from datetime import UTC, datetime, timedelta

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.application.dto.user_session import (
    ClientType,
    SessionTokensDTO,
    SignInMethod,
)
from app.application.services.session_store import SessionStore
from app.application.use_cases.sessions.open_session import (
    OpenSessionUseCase,
)
from app.core.tokens import create_access_token
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)
from app.lib.types import generate_snowflake_id

BROWSER_USER_AGENT = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
)


async def open_session(
    async_engine: AsyncEngine,
    redis_client: redis.Redis,
    user_id: int,
    *,
    client_type: ClientType = 'web',
    sign_in_method: SignInMethod = 'borderless',
    user_agent: str | None = BROWSER_USER_AGENT,
    ip: str | None = '203.0.113.7',
    device_name: str | None = None,
) -> SessionTokensDTO:
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        use_case = OpenSessionUseCase(
            UserSessionRepository(session), SessionStore(redis_client)
        )
        return await use_case.execute(
            user_id=user_id,
            client_type=client_type,
            sign_in_method=sign_in_method,
            user_agent=user_agent,
            ip=ip,
            device_name=device_name,
        )


async def live_access_token(
    redis_client: redis.Redis,
    user_id: int,
    session_id: int | None = None,
) -> str:
    """An access JWT whose session is live in Redis only - no
    ``user_sessions`` row. Enough for ``get_current_user``, which checks the
    Redis key; for tests that only need to be signed in."""
    sid = session_id if session_id is not None else generate_snowflake_id()
    await SessionStore(redis_client).open(
        session_id=sid,
        user_id=user_id,
        expires_at=datetime.now(UTC) + timedelta(days=7),
        last_ip=None,
    )
    token, _, _ = create_access_token(str(user_id), str(sid))
    return token
