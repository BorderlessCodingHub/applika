"""Seed the two deterministic E2E users and mint REAL sessions.

Part of the production-simulating E2E harness (see
``docker-compose.e2e.yml`` and ``scripts/e2e.sh``). GitHub OAuth is the
only login path and it cannot run in a headless CI browser, so instead of
mocking auth in the browser we mint a genuine session out of band: this
CLI upserts two synthetic users through the REAL ``UserRepository`` and
mints REAL tokens with the app's own ``app.core.tokens`` code against the
stack's own secrets. The E2E browser then carries a real cookie and every
request afterwards hits the real API, the real Postgres and the real
Redis — nothing is stubbed and NO login route is added.

It is intentionally a CLI run INSIDE the running e2e container
(``docker compose -f docker-compose.e2e.yml exec -T api python -m
app.scripts.seed_e2e``), never a route mounted in the app, so it exercises
real code without adding any network-reachable test surface. It refuses to
run when ``ENVIRONMENT == 'PROD'``.

Two token facts that are easy to get wrong:

* the access token ``sub`` is the user's ``github_id``
  (``get_current_user`` does ``get_by_github_id(int(sub))``);
* the refresh token maps to the user's PRIMARY KEY ``id``
  (``validate_refresh_token`` returns it and ``refresh_token`` looks the
  user up with ``get_by_id``).

``/auth/refresh`` works for these users because
``app/application/use_cases/refresh_token.py`` skips the GitHub token
check when ``user.encrypted_github_token`` is empty — which is why both
seeded users are stored with ``encrypted_github_token = NULL``.

Support data (platforms, steps_definition, feedbacks_definition) is NOT
seeded here: the initial revision ``e3abe9dc93d4_init_db`` bulk-inserts
all three tables, so ``alembic upgrade head`` already provides them.

Prints exactly one JSON line to stdout::

    {"user_id": "...", "access_token": "...", "refresh_token": "...",
     "admin_user_id": "...", "admin_access_token": "...",
     "admin_refresh_token": "..."}
"""

import asyncio
import json
import sys
from typing import NamedTuple

import redis.asyncio as redis

from app.application.dto.user import UserCreateDTO
from app.config.db import AsyncLocalSession
from app.config.redis import redis_client
from app.config.settings import envs
from app.core.tokens import create_access_token, create_refresh_token_value
from app.domain.repositories.user_repository import UserRepository

# Deterministic, synthetic identities — NOT real data. The github_id
# values sit far above GitHub's real id range (9-digit today) so they can
# never collide with a genuine account, yet stay below
# Number.MAX_SAFE_INTEGER: UserDTO serialises github_id as a JSON number,
# so a larger value would silently lose precision in the browser and in
# the Playwright specs. They are stable across runs so specs can rely on
# a known seeded user.
E2E_USER = UserCreateDTO(
    github_id=999000000001,
    username='e2e-user',
    email='e2e-user@e2e.applika.dev',
)
E2E_ADMIN = UserCreateDTO(
    github_id=999000000002,
    username='e2e-admin',
    email='e2e-admin@e2e.applika.dev',
)


class Identity(NamedTuple):
    """The two ids the token code needs, decoupled from the ORM object."""

    github_id: int
    user_id: int


async def upsert_user(
    repo: UserRepository,
    dto: UserCreateDTO,
    *,
    is_admin: bool,
) -> Identity:
    """Create or refresh one seeded user. Idempotent by ``github_id``."""
    user = await repo.get_by_github_id(dto.github_id)
    if user is None:
        user = await repo.create(dto)

    user.username = dto.username
    user.email = dto.email
    user.is_admin = is_admin
    # Empty on purpose: it makes /auth/refresh skip the GitHub call.
    user.encrypted_github_token = None
    user = await repo.update(user)

    return Identity(github_id=user.github_id, user_id=user.id)


async def upsert_users() -> tuple[Identity, Identity]:
    """Upsert the regular user and the admin user, in that order."""
    async with AsyncLocalSession() as session:
        repo = UserRepository(session)
        user = await upsert_user(repo, E2E_USER, is_admin=False)
        admin = await upsert_user(repo, E2E_ADMIN, is_admin=True)
    return user, admin


async def mint_session(
    identity: Identity,
    redis_conn: redis.Redis,
) -> tuple[str, str]:
    """Mint a real access token + a real Redis-backed refresh token."""
    access_token, _expires_dt, _max_age = create_access_token(
        str(identity.github_id)
    )
    refresh_token, _ttl = await create_refresh_token_value(
        identity.user_id, redis_conn
    )
    return access_token, refresh_token


async def seed() -> dict[str, str]:
    """Upsert both users and return the E2E contract payload."""
    user, admin = await upsert_users()
    try:
        access_token, refresh_token = await mint_session(user, redis_client)
        admin_access_token, admin_refresh_token = await mint_session(
            admin, redis_client
        )
    finally:
        await redis_client.aclose()

    return {
        'user_id': str(user.user_id),
        'access_token': access_token,
        'refresh_token': refresh_token,
        'admin_user_id': str(admin.user_id),
        'admin_access_token': admin_access_token,
        'admin_refresh_token': admin_refresh_token,
    }


def refuse_in_prod() -> None:
    """Abort before touching the database or Redis when in production."""
    if envs.ENVIRONMENT == 'PROD':
        print(
            'seed_e2e refuses to run with ENVIRONMENT=PROD.',
            file=sys.stderr,
        )
        raise SystemExit(1)


def main() -> None:
    refuse_in_prod()
    print(json.dumps(asyncio.run(seed())))


if __name__ == '__main__':
    main()
