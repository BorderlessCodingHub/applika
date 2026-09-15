"""Unit tests for the E2E session seeder.

Fast by design: the database session and the Redis client are replaced,
so the real token code is exercised without any container.
"""

import json

import pytest

from app.application.dto.user import UserCreateDTO
from app.config.settings import envs
from app.core.tokens import decode_token
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
    repo = FakeUserRepository()

    first = await seed_e2e.upsert_user(repo, seed_e2e.E2E_ADMIN, is_admin=True)
    second = await seed_e2e.upsert_user(repo, seed_e2e.E2E_ADMIN, is_admin=True)

    assert first == second
    assert first.github_id == seed_e2e.E2E_ADMIN.github_id
    row = repo.rows[seed_e2e.E2E_ADMIN.github_id]
    assert row.is_admin is True
    # Emptied so /auth/refresh skips the GitHub token check.
    assert row.encrypted_github_token is None


async def test_minted_access_token_subject_is_the_github_id():
    """The access token decodes and its sub is github_id, not the pk."""
    identity = seed_e2e.Identity(github_id=999000000001, user_id=4242)
    fake_redis = FakeRedis()

    access_token, refresh_token = await seed_e2e.mint_session(
        identity, fake_redis
    )

    payload = decode_token(access_token)
    assert payload['sub'] == str(identity.github_id)
    assert payload['kind'] == 'access'
    # The refresh token resolves to the PRIMARY KEY, not the github_id.
    key = f'applika:refresh_token:{refresh_token}'
    assert fake_redis.store[key] == str(identity.user_id)


async def test_seed_returns_the_six_contract_keys(monkeypatch):
    """seed() returns both sessions under the agreed contract keys."""
    user = seed_e2e.Identity(github_id=999000000001, user_id=11)
    admin = seed_e2e.Identity(github_id=999000000002, user_id=22)
    fake_redis = FakeRedis()

    async def _identities():
        return user, admin

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
    }
    assert all(isinstance(value, str) for value in payload.values())
    assert payload['user_id'] == '11'
    assert payload['admin_user_id'] == '22'
    assert decode_token(payload['access_token'])['sub'] == str(user.github_id)
    assert decode_token(payload['admin_access_token'])['sub'] == str(
        admin.github_id
    )
    assert fake_redis.closed is True


def test_main_prints_one_json_line_with_the_contract(monkeypatch, capsys):
    """stdout is exactly one JSON line carrying the six string keys."""
    user = seed_e2e.Identity(github_id=999000000001, user_id=11)
    admin = seed_e2e.Identity(github_id=999000000002, user_id=22)

    async def _identities():
        return user, admin

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
    }


def test_seed_github_ids_survive_json_number_precision():
    """github_id is a JSON number: it must stay JS-safe (< 2**53)."""
    max_safe_integer = 2**53 - 1
    for dto in (seed_e2e.E2E_USER, seed_e2e.E2E_ADMIN):
        # Above every real GitHub account id, below the JS safe range.
        assert 10_000_000_000 < dto.github_id < max_safe_integer
