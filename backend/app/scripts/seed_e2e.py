"""Seed the three deterministic E2E users and mint REAL sessions.

Part of the production-simulating E2E harness (see
``docker-compose.e2e.yml`` and ``scripts/e2e.sh``). GitHub OAuth is the
only login path and it cannot run in a headless CI browser, so instead of
mocking auth in the browser we mint a genuine session out of band: this
CLI upserts three synthetic users through the REAL ``UserRepository`` and
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
check when ``user.encrypted_github_token`` is empty — which is why every
seeded user is stored with ``encrypted_github_token = NULL``.

Support data (platforms, steps_definition, feedbacks_definition) is NOT
seeded here: the initial revision ``e3abe9dc93d4_init_db`` bulk-inserts
all three tables, so ``alembic upgrade head`` already provides them.

KODI-024: the Discord link moved off ``users.discord_id`` onto its own
``discord_connections`` row (revision ``ba44f9cfd3c1``). The third user,
``e2e-discord``, gets its connection row re-created on every run through
``DiscordConnectionRepository.link`` (a fixed Discord id, username and
scope, a dummy refresh token encrypted with the stack's own
``DISCORD_TOKEN_ENCRYPTION_KEY``, status ``active``) — so a Disconnect
performed by the E2E is undone the next time this script runs.
``e2e-user`` and ``e2e-admin`` have their connection deleted on every
upsert, so both stay deterministically unlinked run after run.

KODI-052 (ADR-0018, plan 0013 corrections 2 and 8): every run also puts
the beta features back in a known state - ``jobs`` in ``beta`` with
``released_at`` NULL, ``e2e-user`` on its beta list, ``e2e-discord`` off it,
and every opt-out of ``e2e-admin`` gone - so a crashed beta-features spec
cannot leak into the next run. The ``jobs`` row itself comes from
``alembic upgrade head`` (revision ``641001baff09``); without it the script
fails loudly.

Prints exactly one JSON line to stdout::

    {"user_id": "...", "access_token": "...", "refresh_token": "...",
     "admin_user_id": "...", "admin_access_token": "...",
     "admin_refresh_token": "...", "discord_user_id": "...",
     "discord_access_token": "...", "discord_refresh_token": "..."}
"""

import asyncio
import json
import sys
from typing import NamedTuple

import redis.asyncio as redis

from app.application.dto.user import UserCreateDTO
from app.application.services.discord_oauth_service import SCOPE
from app.config.db import AsyncLocalSession
from app.config.redis import redis_client
from app.config.settings import envs
from app.core.crypto import encrypt_discord_token
from app.core.features import FeatureKey, FeatureStage
from app.core.tokens import create_access_token, create_refresh_token_value
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)
from app.domain.repositories.feature_repository import FeatureRepository
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
E2E_DISCORD = UserCreateDTO(
    github_id=999000000003,
    username='e2e-discord',
    email='e2e-discord@e2e.applika.dev',
)

# Fixed synthetic Discord id, re-linked to E2E_DISCORD's connection row on
# every seed run. Unlike the github_ids above it need not stay JS-safe:
# the Discord id is never a field on any schema (``DiscordAccountOut``
# carries no id) so it never reaches the browser as a number.
E2E_DISCORD_ID = 999000000000000003
E2E_DISCORD_USERNAME = 'e2e-discord'
E2E_DISCORD_GLOBAL_NAME = 'E2E Discord'
# Not a real Discord refresh token - the E2E stack revokes it best-effort
# against discord.com with dummy OAuth credentials, and that revoke is
# swallowed within the 5s timeout (plan corrections, K6).
E2E_DISCORD_REFRESH_TOKEN = 'e2e-dummy-refresh-token'


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
    """Create or refresh one seeded user. Idempotent by ``github_id``.

    KODI-024: the Discord link is no longer set here - it is a separate
    connection row, written by ``upsert_users`` through
    ``DiscordConnectionRepository``.
    """
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


async def upsert_users() -> tuple[Identity, Identity, Identity]:
    """Upsert the regular, admin and Discord-linked users, in order, and
    reset every seeded user's Discord connection to its deterministic
    state (KODI-024)."""
    async with AsyncLocalSession() as session:
        repo = UserRepository(session)
        conn_repo = DiscordConnectionRepository(session)

        user = await upsert_user(repo, E2E_USER, is_admin=False)
        admin = await upsert_user(repo, E2E_ADMIN, is_admin=True)
        discord_user = await upsert_user(repo, E2E_DISCORD, is_admin=False)

        # Always unlinked, run after run.
        await conn_repo.delete_by_user_id(user.user_id)
        await conn_repo.delete_by_user_id(admin.user_id)

        # Always linked to the fixed synthetic Discord id, refreshed in
        # place: ``link`` re-sets every field including ``status=active``
        # and ``linked_at``, undoing a Disconnect performed by the E2E.
        encrypted_refresh_token = encrypt_discord_token(
            E2E_DISCORD_REFRESH_TOKEN
        )
        assert encrypted_refresh_token is not None, (
            'DISCORD_TOKEN_ENCRYPTION_KEY must be set in the E2E stack'
        )
        await conn_repo.link(
            user_id=discord_user.user_id,
            discord_id=E2E_DISCORD_ID,
            username=E2E_DISCORD_USERNAME,
            global_name=E2E_DISCORD_GLOBAL_NAME,
            avatar=None,
            scopes=SCOPE,
            encrypted_refresh_token=encrypted_refresh_token,
            access_token_expires_at=None,
        )

    return user, admin, discord_user


async def reset_beta_features(
    user: Identity, admin: Identity, discord_user: Identity
) -> None:
    """Put ``jobs`` back in ``beta`` (``released_at`` NULL), enrol
    ``e2e-user`` (added by ``e2e-admin``), take ``e2e-discord`` off the list
    and clear every opt-out of ``e2e-admin`` - the same state on every run
    (KODI-052)."""
    async with AsyncLocalSession() as session:
        repo = FeatureRepository(session)
        jobs = await repo.get_by_key(FeatureKey.JOBS.value)
        if jobs is None:
            raise RuntimeError(
                'The "jobs" feature row is missing: run alembic upgrade '
                'head (revision 641001baff09) before seeding.'
            )
        await repo.set_stage(jobs.id, FeatureStage.BETA)
        await repo.add_user(jobs.id, user.user_id, admin.user_id)
        await repo.remove_user(jobs.id, discord_user.user_id)
        await repo.clear_opt_outs(admin.user_id)


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
    """Upsert all three users and return the E2E contract payload."""
    user, admin, discord_user = await upsert_users()
    await reset_beta_features(user, admin, discord_user)
    try:
        access_token, refresh_token = await mint_session(user, redis_client)
        admin_access_token, admin_refresh_token = await mint_session(
            admin, redis_client
        )
        discord_access_token, discord_refresh_token = await mint_session(
            discord_user, redis_client
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
        'discord_user_id': str(discord_user.user_id),
        'discord_access_token': discord_access_token,
        'discord_refresh_token': discord_refresh_token,
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
