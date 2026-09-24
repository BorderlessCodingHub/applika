"""Unit tests for the E2E session seeder.

Fast by design: the database session and the Redis client are replaced,
so the real token code is exercised without any container.
"""

import json
from typing import cast

import pytest
import redis.asyncio as redis

from app.application.dto.user import UserCreateDTO
from app.config.settings import envs
from app.core.tokens import decode_token
from app.domain.repositories.user_repository import UserRepository
from app.scripts import seed_e2e


class FakeRedis:
    """Minimal stand-in for the async Redis client the seeder uses."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.closed = False

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.store[key] = value

    async def aclose(self) -> None:
        self.closed = True


class FakeUserRepository:
    """In-memory UserRepository double keyed by github_id."""

    def __init__(self):
        self.rows: dict[int, 'FakeUserRow'] = {}
        self.next_id = 1000

    async def get_by_github_id(self, id: int):
        return self.rows.get(id)

    async def create(self, user: UserCreateDTO):
        self.next_id += 1
        row = FakeUserRow(
            id=self.next_id,
            github_id=user.github_id,
            username=user.username,
            email=user.email,
        )
        self.rows[user.github_id] = row
        return row

    async def update(self, user):
        self.rows[user.github_id] = user
        return user


class FakeUserRow:
    def __init__(self, id: int, github_id: int, username: str, email: str):
        self.id = id
        self.github_id = github_id
        self.username = username
        self.email = email
        self.is_admin = False
        self.encrypted_github_token = 'stale-token'
        self.discord_id: int | None = None


def test_refuses_to_run_in_prod(monkeypatch, capsys):
    """PROD must abort with a non-zero exit and print nothing on stdout."""
    monkeypatch.setattr(envs, 'ENVIRONMENT', 'PROD')

    with pytest.raises(SystemExit) as exc_info:
        seed_e2e.main()

    assert exc_info.value.code != 0
    captured = capsys.readouterr()
    assert captured.out == ''
    assert 'PROD' in captured.err


def test_refuses_before_touching_the_database(monkeypatch):
    """The PROD guard runs before any database or Redis access."""
    monkeypatch.setattr(envs, 'ENVIRONMENT', 'PROD')

    async def _explode() -> None:
        raise AssertionError('upsert_users must not run in PROD')

    monkeypatch.setattr(seed_e2e, 'upsert_users', _explode)

    with pytest.raises(SystemExit):
        seed_e2e.main()


async def test_upsert_creates_then_updates_idempotently():
    """Running the upsert twice yields the same row, admin flag applied."""
    fake_repo = FakeUserRepository()
    repo = cast(UserRepository, fake_repo)

    first = await seed_e2e.upsert_user(
        repo, seed_e2e.E2E_ADMIN, is_admin=True, discord_id=None
    )
    second = await seed_e2e.upsert_user(
        repo, seed_e2e.E2E_ADMIN, is_admin=True, discord_id=None
    )

    assert first == second
    assert first.github_id == seed_e2e.E2E_ADMIN.github_id
    row = fake_repo.rows[seed_e2e.E2E_ADMIN.github_id]
    assert row.is_admin is True
    # Emptied so /auth/refresh skips the GitHub token check.
    assert row.encrypted_github_token is None


async def test_upsert_sets_the_fixed_discord_id_on_every_call():
    """e2e-discord gets E2E_DISCORD_ID re-set on every upsert."""
    fake_repo = FakeUserRepository()
    repo = cast(UserRepository, fake_repo)

    await seed_e2e.upsert_user(
        repo,
        seed_e2e.E2E_DISCORD,
        is_admin=False,
        discord_id=seed_e2e.E2E_DISCORD_ID,
    )
    row = fake_repo.rows[seed_e2e.E2E_DISCORD.github_id]
    assert row.discord_id == seed_e2e.E2E_DISCORD_ID

    # Simulate the E2E performing a Disconnect between two seed runs.
    row.discord_id = None
    await seed_e2e.upsert_user(
        repo,
        seed_e2e.E2E_DISCORD,
        is_admin=False,
        discord_id=seed_e2e.E2E_DISCORD_ID,
    )
    assert row.discord_id == seed_e2e.E2E_DISCORD_ID


async def test_upsert_resets_discord_id_to_none_for_unlinked_users():
    """e2e-user / e2e-admin always come back out unlinked."""
    fake_repo = FakeUserRepository()
    repo = cast(UserRepository, fake_repo)

    await seed_e2e.upsert_user(
        repo, seed_e2e.E2E_USER, is_admin=False, discord_id=None
    )
    row = fake_repo.rows[seed_e2e.E2E_USER.github_id]
    # Simulate a stray discord_id somehow set on this user's row.
    row.discord_id = 123
    await seed_e2e.upsert_user(
        repo, seed_e2e.E2E_USER, is_admin=False, discord_id=None
    )
    assert row.discord_id is None


class FakeSession:
    """Stands in for the async-context-managed DB session ``upsert_users``
    opens; nothing in it is used directly since the repository is faked
    too."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False


async def test_upsert_users_assigns_discord_id_only_to_e2e_discord(
    monkeypatch,
):
    """upsert_users() itself wires is_admin/discord_id to the right user.

    Exercises the function the seed script actually calls (not just
    upsert_user() with hand-picked arguments), so a swapped discord_id or
    is_admin between the three calls in upsert_users() would fail this.
    """
    fake_repo = FakeUserRepository()

    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'UserRepository', lambda session: fake_repo)

    user, admin, discord_user = await seed_e2e.upsert_users()

    assert (user.github_id, admin.github_id, discord_user.github_id) == (
        seed_e2e.E2E_USER.github_id,
        seed_e2e.E2E_ADMIN.github_id,
        seed_e2e.E2E_DISCORD.github_id,
    )

    user_row = fake_repo.rows[seed_e2e.E2E_USER.github_id]
    admin_row = fake_repo.rows[seed_e2e.E2E_ADMIN.github_id]
    discord_row = fake_repo.rows[seed_e2e.E2E_DISCORD.github_id]

    assert (user_row.is_admin, user_row.discord_id) == (False, None)
    assert (admin_row.is_admin, admin_row.discord_id) == (True, None)
    assert (discord_row.is_admin, discord_row.discord_id) == (
        False,
        seed_e2e.E2E_DISCORD_ID,
    )

    # A second run must undo a stray discord_id on the wrong users and
    # re-affirm the fixed one on e2e-discord (the "every upsert" rule).
    user_row.discord_id = 111
    admin_row.discord_id = 222
    discord_row.discord_id = None
    await seed_e2e.upsert_users()

    assert user_row.discord_id is None
    assert admin_row.discord_id is None
    assert discord_row.discord_id == seed_e2e.E2E_DISCORD_ID


async def test_minted_access_token_subject_is_the_github_id():
    """The access token decodes and its sub is github_id, not the pk."""
    identity = seed_e2e.Identity(github_id=999000000001, user_id=4242)
    fake_redis = FakeRedis()

    access_token, refresh_token = await seed_e2e.mint_session(
        identity, cast(redis.Redis, fake_redis)
    )

    payload = decode_token(access_token)
    assert payload['sub'] == str(identity.github_id)
    assert payload['kind'] == 'access'
    # The refresh token resolves to the PRIMARY KEY, not the github_id.
    key = f'applika:refresh_token:{refresh_token}'
    assert fake_redis.store[key] == str(identity.user_id)


async def test_seed_returns_the_nine_contract_keys(monkeypatch):
    """seed() returns all three sessions under the agreed contract keys."""
    user = seed_e2e.Identity(github_id=999000000001, user_id=11)
    admin = seed_e2e.Identity(github_id=999000000002, user_id=22)
    discord_user = seed_e2e.Identity(github_id=999000000003, user_id=33)
    fake_redis = FakeRedis()

    async def _identities():
        return user, admin, discord_user

    monkeypatch.setattr(seed_e2e, 'upsert_users', _identities)
    monkeypatch.setattr(seed_e2e, 'redis_client', fake_redis)

    payload = await seed_e2e.seed()

    assert set(payload) == {
        'user_id',
        'access_token',
        'refresh_token',
        'admin_user_id',
        'admin_access_token',
        'admin_refresh_token',
        'discord_user_id',
        'discord_access_token',
        'discord_refresh_token',
    }
    assert all(isinstance(value, str) for value in payload.values())
    assert payload['user_id'] == '11'
    assert payload['admin_user_id'] == '22'
    assert payload['discord_user_id'] == '33'
    assert decode_token(payload['access_token'])['sub'] == str(user.github_id)
    assert decode_token(payload['admin_access_token'])['sub'] == str(
        admin.github_id
    )
    assert decode_token(payload['discord_access_token'])['sub'] == str(
        discord_user.github_id
    )
    assert fake_redis.closed is True


def test_main_prints_one_json_line_with_the_contract(monkeypatch, capsys):
    """stdout is exactly one JSON line carrying the nine string keys."""
    user = seed_e2e.Identity(github_id=999000000001, user_id=11)
    admin = seed_e2e.Identity(github_id=999000000002, user_id=22)
    discord_user = seed_e2e.Identity(github_id=999000000003, user_id=33)

    async def _identities():
        return user, admin, discord_user

    monkeypatch.setattr(seed_e2e, 'upsert_users', _identities)
    monkeypatch.setattr(seed_e2e, 'redis_client', FakeRedis())

    seed_e2e.main()

    out = capsys.readouterr().out
    assert out.count('\n') == 1
    payload = json.loads(out)
    assert set(payload) == {
        'user_id',
        'access_token',
        'refresh_token',
        'admin_user_id',
        'admin_access_token',
        'admin_refresh_token',
        'discord_user_id',
        'discord_access_token',
        'discord_refresh_token',
    }


def test_seed_github_ids_survive_json_number_precision():
    """github_id is a JSON number: it must stay JS-safe (< 2**53)."""
    max_safe_integer = 2**53 - 1
    for dto in (seed_e2e.E2E_USER, seed_e2e.E2E_ADMIN, seed_e2e.E2E_DISCORD):
        # Above every real GitHub account id, below the JS safe range.
        assert 10_000_000_000 < dto.github_id < max_safe_integer


def test_e2e_discord_identity():
    """The Discord-linked seed user carries the documented identity."""
    assert seed_e2e.E2E_DISCORD.github_id == 999000000003
    assert seed_e2e.E2E_DISCORD.username == 'e2e-discord'
    assert seed_e2e.E2E_DISCORD.email == 'e2e-discord@e2e.applika.dev'


def test_e2e_discord_id_is_fixed_and_not_js_safe():
    """discord_id is internal-only, so it need not stay a JS-safe number."""
    max_safe_integer = 2**53 - 1
    assert seed_e2e.E2E_DISCORD_ID == 999000000000000003
    assert seed_e2e.E2E_DISCORD_ID > max_safe_integer
