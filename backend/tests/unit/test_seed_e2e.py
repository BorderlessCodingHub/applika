"""Unit tests for the E2E session seeder.

Fast by design: the database session, the Redis client and the two
repositories are replaced, so the real token code is exercised without any
container.

KODI-024: the Discord link moved off ``users.discord_id`` onto its own
connection row, written through ``DiscordConnectionRepository``.
"""

import json
from typing import cast

import pytest
import redis.asyncio as redis
from cryptography.fernet import Fernet

from app.application.dto.user import UserCreateDTO
from app.config.settings import envs
from app.core.features import FeatureStage
from app.core.tokens import decode_token
from app.domain.repositories.user_repository import UserRepository
from app.scripts import seed_e2e


class FakePipeline:
    """The MULTI ``SessionStore.open`` runs: SET, HSET, EXPIREAT."""

    def __init__(self, redis_stub: 'FakeRedis'):
        self.redis = redis_stub
        self.ops: list[tuple] = []

    def set(self, key: str, value: str, exat: int | None = None):
        self.ops.append(('set', key, value, exat))

    def hset(self, key: str, mapping: dict[str, str]):
        self.ops.append(('hset', key, mapping))

    def expireat(self, key: str, when: int):
        self.ops.append(('expireat', key, when))

    async def execute(self):
        for op in self.ops:
            if op[0] == 'set':
                self.redis.store[op[1]] = op[2]
                self.redis.expire_at[op[1]] = op[3]
            elif op[0] == 'hset':
                self.redis.hashes[op[1]] = dict(op[2])
            else:
                self.redis.expire_at[op[1]] = op[2]
        return [True] * len(self.ops)


class FakeRedis:
    """Minimal stand-in for the async Redis client the seeder uses."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.expire_at: dict[str, int | None] = {}
        self.closed = False

    def register_script(self, _source: str):
        async def _unused(keys, args):
            raise AssertionError('the seeder runs no script')

        return _unused

    def pipeline(self, transaction: bool = True) -> FakePipeline:
        return FakePipeline(self)

    async def aclose(self) -> None:
        self.closed = True


class FakeSessionRow:
    def __init__(
        self,
        id: int,
        *,
        user_id: int,
        client_type: str,
        sign_in_method: str,
        device_name: str,
        user_agent: str | None,
        ip: str | None,
        expires_at,
    ):
        self.id = id
        self.user_id = user_id
        self.client_type = client_type
        self.sign_in_method = sign_in_method
        self.device_name = device_name
        self.user_agent = user_agent
        self.ip = ip
        self.expires_at = expires_at


class FakeUserSessionRepository:
    """In-memory ``UserSessionRepository.create``."""

    def __init__(self):
        self.rows: list[FakeSessionRow] = []

    async def create(self, **fields) -> FakeSessionRow:
        row = FakeSessionRow(id=5000 + len(self.rows), **fields)
        self.rows.append(row)
        return row


def _fake_sessions(monkeypatch) -> FakeUserSessionRepository:
    """KODI-057: ``mint_session`` opens a real device session through
    ``OpenSessionUseCase``; the row goes to this fake, the keys to
    ``FakeRedis``."""
    repo = FakeUserSessionRepository()
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'UserSessionRepository', lambda s: repo)
    return repo


async def _no_reset(*_identities) -> None:
    """``seed()`` resets the beta features (KODI-052); the contract tests
    here do not touch a database."""


class FakeUserRow:
    def __init__(self, id: int, github_id: int, username: str, email: str):
        self.id = id
        self.github_id = github_id
        self.username = username
        self.email = email
        self.is_admin = False
        self.encrypted_github_token = 'stale-token'


class FakeUserRepository:
    """In-memory UserRepository double keyed by github_id."""

    def __init__(self):
        self.rows: dict[int, FakeUserRow] = {}
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


class FakeConnectionRow:
    def __init__(
        self,
        *,
        user_id: int,
        discord_id: int | None = None,
        username: str | None = None,
        global_name: str | None = None,
        avatar: str | None = None,
        scopes: str | None = None,
        encrypted_refresh_token: str | None = None,
        access_token_expires_at=None,
        status: str | None = None,
    ):
        self.user_id = user_id
        self.discord_id = discord_id
        self.username = username
        self.global_name = global_name
        self.avatar = avatar
        self.scopes = scopes
        self.encrypted_refresh_token = encrypted_refresh_token
        self.access_token_expires_at = access_token_expires_at
        self.status = status


class FakeDiscordConnectionRepository:
    """In-memory DiscordConnectionRepository double keyed by user_id."""

    def __init__(self):
        self.rows: dict[int, FakeConnectionRow] = {}

    async def delete_by_user_id(self, user_id: int) -> None:
        self.rows.pop(user_id, None)

    async def link(
        self,
        *,
        user_id: int,
        discord_id: int,
        username: str,
        global_name: str | None,
        avatar: str | None,
        scopes: str,
        encrypted_refresh_token: str,
        access_token_expires_at,
    ) -> FakeConnectionRow:
        row = FakeConnectionRow(
            user_id=user_id,
            discord_id=discord_id,
            username=username,
            global_name=global_name,
            avatar=avatar,
            scopes=scopes,
            encrypted_refresh_token=encrypted_refresh_token,
            access_token_expires_at=access_token_expires_at,
            status='active',
        )
        self.rows[user_id] = row
        return row


class FakeSession:
    """Stands in for the async-context-managed DB session ``upsert_users``
    opens; nothing in it is used directly since both repositories are
    faked too."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False


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

    first = await seed_e2e.upsert_user(repo, seed_e2e.E2E_ADMIN, is_admin=True)
    second = await seed_e2e.upsert_user(repo, seed_e2e.E2E_ADMIN, is_admin=True)

    assert first == second
    assert first.github_id == seed_e2e.E2E_ADMIN.github_id
    row = fake_repo.rows[seed_e2e.E2E_ADMIN.github_id]
    assert row.is_admin is True
    # Emptied so /auth/refresh skips the GitHub token check.
    assert row.encrypted_github_token is None


async def test_upsert_users_links_discord_connection_only_for_e2e_discord(
    monkeypatch,
):
    """upsert_users() links e2e-discord's connection and deletes the other
    two's, deterministically re-set on every run."""
    fake_repo = FakeUserRepository()
    fake_conn_repo = FakeDiscordConnectionRepository()

    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'UserRepository', lambda session: fake_repo)
    monkeypatch.setattr(
        seed_e2e, 'DiscordConnectionRepository', lambda session: fake_conn_repo
    )

    user, admin, discord_user = await seed_e2e.upsert_users()

    assert set(fake_conn_repo.rows) == {discord_user.user_id}
    connection = fake_conn_repo.rows[discord_user.user_id]
    assert connection.discord_id == seed_e2e.E2E_DISCORD_ID
    assert connection.username == seed_e2e.E2E_DISCORD_USERNAME
    assert connection.global_name == seed_e2e.E2E_DISCORD_GLOBAL_NAME
    assert connection.avatar is None
    assert connection.scopes == seed_e2e.SCOPE
    assert connection.encrypted_refresh_token is not None

    # Simulate the E2E performing a Disconnect and a stray link between two
    # seed runs; the next run must undo both.
    fake_conn_repo.rows.pop(discord_user.user_id, None)
    fake_conn_repo.rows[user.user_id] = FakeConnectionRow(user_id=user.user_id)
    fake_conn_repo.rows[admin.user_id] = FakeConnectionRow(
        user_id=admin.user_id
    )

    await seed_e2e.upsert_users()

    assert set(fake_conn_repo.rows) == {discord_user.user_id}


async def test_upsert_users_assigns_admin_flag_to_the_right_user(
    monkeypatch,
):
    """upsert_users() itself wires is_admin to the right user (not just
    upsert_user() with hand-picked arguments)."""
    fake_repo = FakeUserRepository()
    fake_conn_repo = FakeDiscordConnectionRepository()

    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'UserRepository', lambda session: fake_repo)
    monkeypatch.setattr(
        seed_e2e, 'DiscordConnectionRepository', lambda session: fake_conn_repo
    )

    user, admin, discord_user = await seed_e2e.upsert_users()

    assert (user.github_id, admin.github_id, discord_user.github_id) == (
        seed_e2e.E2E_USER.github_id,
        seed_e2e.E2E_ADMIN.github_id,
        seed_e2e.E2E_DISCORD.github_id,
    )

    user_row = fake_repo.rows[seed_e2e.E2E_USER.github_id]
    admin_row = fake_repo.rows[seed_e2e.E2E_ADMIN.github_id]

    assert user_row.is_admin is False
    assert admin_row.is_admin is True


async def test_minted_session_is_a_real_device_session(monkeypatch):
    """KODI-057: the access token's sub is the github_id and its sid the
    session row's id; the refresh value is a uuid7 whose Redis key points
    at that row, next to the session hash (ADR-0019)."""
    import uuid

    repo = _fake_sessions(monkeypatch)
    identity = seed_e2e.Identity(github_id=999000000001, user_id=4242)
    fake_redis = FakeRedis()

    access_token, refresh_token = await seed_e2e.mint_session(
        identity, cast(redis.Redis, fake_redis)
    )

    [row] = repo.rows
    assert row.user_id == identity.user_id
    assert row.client_type == 'web'
    assert row.sign_in_method == 'github_web'
    assert row.device_name == 'Chrome on Linux'
    assert row.ip == seed_e2e.E2E_IP

    payload = decode_token(access_token)
    assert payload['sub'] == str(identity.github_id)
    assert payload['kind'] == 'access'
    assert payload.get('sid') == str(row.id)

    assert uuid.UUID(refresh_token).version == 7
    assert fake_redis.store[f'applika:session:{refresh_token}'] == str(row.id)
    session_hash = fake_redis.hashes[f'applika:session:id:{row.id}']
    assert session_hash['rk'] == refresh_token
    assert session_hash['user_id'] == str(identity.user_id)
    assert session_hash['github_id'] == str(identity.github_id)
    # Both keys end at the same instant.
    assert (
        fake_redis.expire_at[f'applika:session:{refresh_token}']
        == fake_redis.expire_at[f'applika:session:id:{row.id}']
    )
    # Nothing reads or writes the pre-KODI-057 keys any more (R-023).
    assert not any('refresh_token' in key for key in fake_redis.store)


async def test_minted_cli_session_is_named_and_typed(monkeypatch):
    repo = _fake_sessions(monkeypatch)
    identity = seed_e2e.Identity(github_id=999000000001, user_id=4242)

    await seed_e2e.mint_session(
        identity,
        cast(redis.Redis, FakeRedis()),
        client_type='cli',
        sign_in_method='cli_device',
        user_agent=seed_e2e.E2E_CLI_USER_AGENT,
        device_name=seed_e2e.E2E_CLI_DEVICE_NAME,
    )

    [row] = repo.rows
    assert (row.client_type, row.sign_in_method, row.device_name) == (
        'cli',
        'cli_device',
        'e2e-cli',
    )


async def test_seed_returns_the_eleven_contract_keys(monkeypatch):
    """seed() returns all three web sessions and e2e-user's CLI session
    under the agreed contract keys (KODI-057: eleven, plan correction
    4)."""
    repo = _fake_sessions(monkeypatch)
    user = seed_e2e.Identity(github_id=999000000001, user_id=11)
    admin = seed_e2e.Identity(github_id=999000000002, user_id=22)
    discord_user = seed_e2e.Identity(github_id=999000000003, user_id=33)
    fake_redis = FakeRedis()

    async def _identities():
        return user, admin, discord_user

    monkeypatch.setattr(seed_e2e, 'upsert_users', _identities)
    monkeypatch.setattr(seed_e2e, 'reset_beta_features', _no_reset)
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
        'cli_access_token',
        'cli_refresh_token',
    }
    assert all(isinstance(value, str) for value in payload.values())
    # Four sessions, the last one the CLI's, signed in as e2e-user.
    assert [row.sign_in_method for row in repo.rows] == [
        'github_web',
        'github_web',
        'github_web',
        'cli_device',
    ]
    assert repo.rows[3].user_id == user.user_id
    cli_payload = decode_token(payload['cli_access_token'])
    assert cli_payload['sub'] == str(user.github_id)
    assert cli_payload.get('sid') == str(repo.rows[3].id)
    assert payload['cli_refresh_token'] != payload['refresh_token']
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
    """stdout is exactly one JSON line carrying the eleven string keys."""
    user = seed_e2e.Identity(github_id=999000000001, user_id=11)
    admin = seed_e2e.Identity(github_id=999000000002, user_id=22)
    discord_user = seed_e2e.Identity(github_id=999000000003, user_id=33)

    async def _identities():
        return user, admin, discord_user

    monkeypatch.setattr(seed_e2e, 'upsert_users', _identities)
    monkeypatch.setattr(seed_e2e, 'reset_beta_features', _no_reset)
    monkeypatch.setattr(seed_e2e, 'redis_client', FakeRedis())
    _fake_sessions(monkeypatch)

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
        'cli_access_token',
        'cli_refresh_token',
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
    """The Discord id is internal-only, so it need not stay a JS-safe
    number - it is never a field on any API schema (DiscordAccountOut
    carries no id)."""
    max_safe_integer = 2**53 - 1
    assert seed_e2e.E2E_DISCORD_ID == 999000000000000003
    assert seed_e2e.E2E_DISCORD_ID > max_safe_integer


# ---------------------------------------------------------------------------
# KODI-052: the beta features are reset on every run
# ---------------------------------------------------------------------------


class FakeFeature:
    id = 77


class FakeFeatureRepository:
    def __init__(self, feature: FakeFeature | None = None):
        self.feature = feature
        self.calls: list[tuple] = []

    async def get_by_key(self, key: str):
        self.calls.append(('get_by_key', key))
        return self.feature

    async def set_stage(self, feature_id, stage):
        self.calls.append(('set_stage', feature_id, stage))

    async def add_user(self, feature_id, user_id, added_by):
        self.calls.append(('add_user', feature_id, user_id, added_by))
        return True

    async def remove_user(self, feature_id, user_id):
        self.calls.append(('remove_user', feature_id, user_id))

    async def clear_opt_outs(self, user_id):
        self.calls.append(('clear_opt_outs', user_id))


IDENTITIES = (
    seed_e2e.Identity(github_id=999000000001, user_id=11),
    seed_e2e.Identity(github_id=999000000002, user_id=22),
    seed_e2e.Identity(github_id=999000000003, user_id=33),
)


async def test_reset_beta_features_puts_jobs_back_in_a_known_state(
    monkeypatch,
):
    fake_repo = FakeFeatureRepository(FakeFeature())
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'FeatureRepository', lambda s: fake_repo)

    await seed_e2e.reset_beta_features(*IDENTITIES)

    assert fake_repo.calls == [
        ('get_by_key', 'jobs'),
        ('set_stage', 77, FeatureStage.BETA),
        ('add_user', 77, 11, 22),
        ('remove_user', 77, 33),
        ('clear_opt_outs', 22),
    ]


async def test_reset_beta_features_fails_loudly_without_the_jobs_row(
    monkeypatch,
):
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(
        seed_e2e, 'FeatureRepository', lambda s: FakeFeatureRepository()
    )

    with pytest.raises(RuntimeError, match='alembic upgrade head'):
        await seed_e2e.reset_beta_features(*IDENTITIES)


async def test_seed_resets_the_beta_features_with_the_three_users(
    monkeypatch,
):
    seen: list[tuple] = []

    async def _identities():
        return IDENTITIES

    async def _reset(*identities):
        seen.append(identities)

    monkeypatch.setattr(seed_e2e, 'upsert_users', _identities)
    monkeypatch.setattr(seed_e2e, 'reset_beta_features', _reset)
    monkeypatch.setattr(seed_e2e, 'redis_client', FakeRedis())
    _fake_sessions(monkeypatch)

    await seed_e2e.seed()

    assert seen == [IDENTITIES]
