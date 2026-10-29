"""Seed the three deterministic E2E users and mint REAL sessions.

Part of the production-simulating E2E harness (see
``docker-compose.e2e.yml`` and ``frontend/scripts/e2e.sh``). Borderless is
the only sign-in (ADR-0024) and the E2E stack talks to the Borderless stub
(``backend/tests/fixtures/borderless/``), never the real Borderless. This
CLI upserts three synthetic users through the REAL repositories, binds each
to its stub account and mints REAL sessions with the app's own code against
the stack's own secrets. The E2E browser then carries a real cookie and
every request afterwards hits the real API, the real Postgres and the real
Redis.

It is intentionally a CLI run INSIDE the running e2e container
(``docker compose -f docker-compose.e2e.yml exec -T api python -m
app.scripts.seed_e2e``), never a route mounted in the app, so it exercises
real code without adding any network-reachable test surface. It refuses to
run when ``ENVIRONMENT == 'PROD'``.

Every session is a REAL device session (ADR-0019), opened through
``OpenSessionUseCase`` exactly as the Borderless sign-in opens one: a
``user_sessions`` row plus its two Redis keys. The access token ``sub`` is
the user's ``users.id`` and its ``sid`` the session row's id; the refresh
value is the session's uuid7.

Each run opens one ``borderless`` session per user ("Chrome on Linux") and
one more ``cli_device`` session for ``e2e-user`` (device ``e2e-cli``), whose
tokens are the ``cli_access_token`` / ``cli_refresh_token`` keys.

Each seeded user is found by its stub Borderless id, else by its email,
and its binding is re-set every run: the stub's fixed seed token
(encrypted with the stack's ``BORDERLESS_TOKEN_ENCRYPTION_KEY``), expiring
7 days from now, ``active``. So ``/auth/refresh`` reads the membership from
the stub. Badges: ``e2e-user`` PSP, ``e2e-admin`` BASE, ``e2e-discord`` BASE.
``e2e-user`` has a GitHub identity on record; every seeded user has the
one-time restore prompt answered. ``e2e-discord`` keeps its name: it is the
beta specs' third user.

Support data (platforms, steps_definition, feedbacks_definition) is NOT
seeded here: the initial revision ``e3abe9dc93d4_init_db`` bulk-inserts
all three tables, so ``alembic upgrade head`` already provides them.

Every run also puts the beta features back in a known state (ADR-0018):
``jobs`` and ``cvs`` in ``beta`` with ``released_at`` NULL, ``e2e-user`` on
their beta lists, ``e2e-discord`` off them, and every opt-out of
``e2e-admin`` gone.

Prints exactly one JSON line to stdout::

    {"user_id": "...", "access_token": "...", "refresh_token": "...",
     "admin_user_id": "...", "admin_access_token": "...",
     "admin_refresh_token": "...", "discord_user_id": "...",
     "discord_access_token": "...", "discord_refresh_token": "...",
     "cli_access_token": "...", "cli_refresh_token": "..."}
"""

import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

import redis.asyncio as redis
from sqlalchemy import update

from app.application.dto.user import UserCreateDTO
from app.application.dto.user_session import ClientType, SignInMethod
from app.application.services.session_store import SessionStore
from app.application.use_cases.sessions.open_session import (
    OpenSessionUseCase,
)
from app.config.db import AsyncLocalSession
from app.config.redis import redis_client
from app.config.settings import envs
from app.core.crypto import encrypt_borderless_token
from app.core.enums import BadgeKey
from app.core.features import FeatureKey, FeatureStage
from app.domain.models import GithubConnectionModel, UserModel
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.feature_repository import FeatureRepository
from app.domain.repositories.github_connection_repository import (
    GithubConnectionRepository,
)
from app.domain.repositories.user_badge_repository import UserBadgeRepository
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)


class SeedAccount(NamedTuple):
    """A seeded user and the stub Borderless account it is bound to. The
    ids and tokens equal ``tests/fixtures/borderless/accounts.json``."""

    user: UserCreateDTO
    borderless_id: str
    seed_token: str
    badge: BadgeKey
    is_admin: bool


# Deterministic, synthetic identities: NOT real data.
E2E_USER = SeedAccount(
    UserCreateDTO(username='e2e-user', email='e2e-user@e2e.applika.dev'),
    'e2e-borderless-user',
    'e2eseedtokenuser0000000000000001',
    BadgeKey.BORDERLESS_PSP,
    False,
)
E2E_ADMIN = SeedAccount(
    UserCreateDTO(username='e2e-admin', email='e2e-admin@e2e.applika.dev'),
    'e2e-borderless-admin',
    'e2eseedtokenadmin000000000000002',
    BadgeKey.BORDERLESS_BASE,
    True,
)
E2E_DISCORD = SeedAccount(
    UserCreateDTO(username='e2e-discord', email='e2e-discord@e2e.applika.dev'),
    'e2e-borderless-discord',
    'e2eseedtokendiscord0000000000003',
    BadgeKey.BORDERLESS_BASE,
    False,
)
SEED_ACCOUNTS = (E2E_USER, E2E_ADMIN, E2E_DISCORD)

# ``e2e-user``'s GitHub-era identity, far above GitHub's real id range.
E2E_USER_GITHUB_ID = 999000000001
SEED_TOKEN_LIFETIME = timedelta(days=7)

# What the seeded sessions look like in the device list.
E2E_IP = '127.0.0.1'
E2E_BROWSER_USER_AGENT = (
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
)
E2E_CLI_USER_AGENT = 'applika-cli/1.1.0 (e2e)'
E2E_CLI_DEVICE_NAME = 'e2e-cli'


class Identity(NamedTuple):
    """The id the token code needs, decoupled from the ORM object."""

    user_id: int


async def upsert_user(session, account: SeedAccount) -> Identity:
    """Create or refresh one seeded user and its binding. Idempotent: found
    by its stub Borderless id, else by its email."""
    users = UserRepository(session)
    bindings = BorderlessAccountRepository(session)
    dto = account.user

    binding = await bindings.get_by_borderless_id(account.borderless_id)
    user = await users.get_by_id(binding.user_id) if binding else None
    if user is None:
        matches = await users.find_by_email_ci(dto.email)
        user = matches[0] if matches else await users.create(dto)
    user_id = user.id

    user.username = dto.username
    user.email = dto.email
    user.is_admin = account.is_admin
    await users.update(user)
    await session.execute(
        update(UserModel)
        .where(UserModel.id == user_id)
        .values(github_restore_prompt_seen_at=datetime.now(UTC))
    )
    await session.commit()

    ciphertext = encrypt_borderless_token(account.seed_token)
    if ciphertext is None:
        raise RuntimeError(
            'BORDERLESS_TOKEN_ENCRYPTION_KEY must be set in the E2E stack'
        )
    expires_at = datetime.now(UTC) + SEED_TOKEN_LIFETIME
    if binding is None:
        binding = await bindings.get_by_user_id(user_id)
    if binding is None:
        await bindings.bind(
            user_id=user_id,
            borderless_user_id=account.borderless_id,
            email=dto.email,
            encrypted_access_token=ciphertext,
            access_token_expires_at=expires_at,
        )
    else:
        binding.borderless_user_id = account.borderless_id
        await bindings.store_tokens(
            binding,
            email=dto.email,
            encrypted_access_token=ciphertext,
            access_token_expires_at=expires_at,
        )
    await UserBadgeRepository(session).apply(user_id, account.badge)
    return Identity(user_id=user_id)


async def ensure_github_identity(session, user_id: int) -> None:
    """``e2e-user`` has a GitHub identity on record, so no restore is
    offered to it."""
    connections = GithubConnectionRepository(session)
    if await connections.get_by_user_id(user_id) is not None:
        return
    held = await connections.find_by_github_id(E2E_USER_GITHUB_ID)
    if held is not None:
        await session.delete(held)
    session.add(
        GithubConnectionModel(
            user_id=user_id,
            github_id=E2E_USER_GITHUB_ID,
            username=E2E_USER.user.username,
            linked_at=datetime.now(UTC),
        )
    )
    await session.commit()


async def upsert_users() -> tuple[Identity, Identity, Identity]:
    """Upsert the regular, admin and third user, in order."""
    async with AsyncLocalSession() as session:
        user = await upsert_user(session, E2E_USER)
        admin = await upsert_user(session, E2E_ADMIN)
        discord_user = await upsert_user(session, E2E_DISCORD)
        await ensure_github_identity(session, user.user_id)
    return user, admin, discord_user


# Every gated feature the E2E resets, with the revision that seeds its row.
BETA_FEATURE_REVISIONS: tuple[tuple[FeatureKey, str], ...] = (
    (FeatureKey.JOBS, '641001baff09'),
    (FeatureKey.CVS, 'f28e3d9705dd'),
)


async def reset_beta_features(
    user: Identity, admin: Identity, discord_user: Identity
) -> None:
    """Put ``jobs`` and ``cvs`` back in ``beta`` (``released_at`` NULL),
    enrol ``e2e-user`` (added by ``e2e-admin``), take ``e2e-discord`` off
    each list and clear every opt-out of ``e2e-admin`` - the same state on
    every run (ADR-0018). Every row is looked up before anything is
    written, so a missing one fails the run with nothing changed."""
    async with AsyncLocalSession() as session:
        repo = FeatureRepository(session)
        feature_ids: list[int] = []
        for key, revision in BETA_FEATURE_REVISIONS:
            feature = await repo.get_by_key(key.value)
            if feature is None:
                raise RuntimeError(
                    f'The "{key.value}" feature row is missing: run alembic '
                    f'upgrade head (revision {revision}) before seeding.'
                )
            feature_ids.append(feature.id)
        for feature_id in feature_ids:
            await repo.set_stage(feature_id, FeatureStage.BETA)
            await repo.add_user(feature_id, user.user_id, admin.user_id)
            await repo.remove_user(feature_id, discord_user.user_id)
        await repo.clear_opt_outs(admin.user_id)


async def mint_session(
    identity: Identity,
    redis_conn: redis.Redis,
    *,
    client_type: ClientType = 'web',
    sign_in_method: SignInMethod = 'borderless',
    user_agent: str = E2E_BROWSER_USER_AGENT,
    device_name: str | None = None,
) -> tuple[str, str]:
    """Open a real device session (row + Redis keys) through the app's own
    ``OpenSessionUseCase``; answers its access JWT and refresh value."""
    async with AsyncLocalSession() as session:
        use_case = OpenSessionUseCase(
            UserSessionRepository(session), SessionStore(redis_conn)
        )
        tokens = await use_case.execute(
            user_id=identity.user_id,
            client_type=client_type,
            sign_in_method=sign_in_method,
            user_agent=user_agent,
            ip=E2E_IP,
            device_name=device_name,
        )
    return tokens.access_token, tokens.refresh_token


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
        cli_access_token, cli_refresh_token = await mint_session(
            user,
            redis_client,
            client_type='cli',
            sign_in_method='cli_device',
            user_agent=E2E_CLI_USER_AGENT,
            device_name=E2E_CLI_DEVICE_NAME,
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
        'cli_access_token': cli_access_token,
        'cli_refresh_token': cli_refresh_token,
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
