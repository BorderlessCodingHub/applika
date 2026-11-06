"""Unit tests for the E2E session seeder.

The token code runs against an in-memory Redis and a faked session
repository; the user upsert (bindings, badges, the GitHub identity) runs
against the test database. The seeded Borderless ids and tokens equal the
stub's ``accounts.json`` (ADR-0024).
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import pytest
import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config.settings import envs
from app.core.crypto import decrypt_borderless_token
from app.core.features import FeatureStage
from app.core.tokens import decode_token
from app.domain.models import (
    BorderlessAccountModel,
    GithubConnectionModel,
    UserBadgeModel,
    UserModel,
)
from app.scripts import seed_e2e

STUB_ACCOUNTS = (
    Path(__file__).parents[1] / 'fixtures' / 'borderless' / 'accounts.json'
)


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


async def test_upsert_users_binds_badges_and_is_idempotent(
    monkeypatch, async_engine, db_session
):
    """Each seeded user is found by its stub Borderless id, else by email;
    its binding holds the stub's seed token (encrypted), expiring in 7
    days, ``active``; badges PSP, BASE, BASE; ``e2e-user`` has a GitHub
    identity; the restore prompt is answered; a rerun changes no id."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', maker)

    first = await seed_e2e.upsert_users()
    async with maker() as session:
        binding = await session.scalar(
            select(BorderlessAccountModel).where(
                BorderlessAccountModel.user_id == first[0].user_id
            )
        )
        assert binding is not None
        binding.status = 'needs_reconnect'
        await session.commit()
    second = await seed_e2e.upsert_users()

    assert first == second
    async with maker() as session:
        for identity, account in zip(
            first, seed_e2e.SEED_ACCOUNTS, strict=True
        ):
            user = await session.get(UserModel, identity.user_id)
            assert user is not None
            assert user.username == account.user.username
            assert user.is_admin is account.is_admin
            assert user.github_restore_prompt_seen_at is not None
            binding = await session.scalar(
                select(BorderlessAccountModel).where(
                    BorderlessAccountModel.user_id == identity.user_id
                )
            )
            assert binding is not None
            assert binding.borderless_user_id == account.borderless_id
            assert binding.status == 'active'
            assert decrypt_borderless_token(
                binding.encrypted_access_token
            ) == (account.seed_token)
            assert binding.access_token_expires_at > datetime.now(
                UTC
            ) + timedelta(days=6)
            badges = list(
                await session.scalars(
                    select(UserBadgeModel.badge).where(
                        UserBadgeModel.user_id == identity.user_id,
                        UserBadgeModel.revoked_at.is_(None),
                    )
                )
            )
            assert badges == [account.badge.value]
        github = list(await session.scalars(select(GithubConnectionModel)))
        assert [(g.user_id, g.github_id) for g in github] == [
            (first[0].user_id, seed_e2e.E2E_USER_GITHUB_ID)
        ]


async def test_upsert_user_adopts_an_existing_account_by_email(
    monkeypatch, async_engine, db_session
):
    db_session.add(
        UserModel(id=77, username='old', email='e2e-admin@e2e.applika.dev')
    )
    await db_session.commit()
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', maker)

    _, admin, _ = await seed_e2e.upsert_users()

    assert admin.user_id == 77


async def test_upsert_refuses_without_the_encryption_key(
    monkeypatch, async_engine, db_session
):
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', maker)
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', None)
    with pytest.raises(RuntimeError, match='BORDERLESS_TOKEN_ENCRYPTION_KEY'):
        await seed_e2e.upsert_users()


def test_seed_accounts_match_the_stub_accounts():
    stub = {
        a['id']: a
        for a in json.loads(STUB_ACCOUNTS.read_text())['accounts']
    }
    memberships = {
        'borderless_psp': 'PSP',
        'borderless_base': 'BASE',
    }
    for account in seed_e2e.SEED_ACCOUNTS:
        entry = stub[account.borderless_id]
        assert entry['email'] == account.user.email
        assert entry['seedToken'] == account.seed_token
        assert entry['membership'] == memberships[account.badge.value]
        assert entry['emailVerified'] is True


async def test_minted_session_is_a_real_device_session(monkeypatch):
    """The access token's sub is the user's id and its sid the
    session row's id; the refresh value is a uuid7 whose Redis key points
    at that row, next to the session hash (ADR-0019)."""
    import uuid

    repo = _fake_sessions(monkeypatch)
    identity = seed_e2e.Identity(user_id=4242)
    fake_redis = FakeRedis()

    access_token, refresh_token = await seed_e2e.mint_session(
        identity, cast(redis.Redis, fake_redis)
    )

    [row] = repo.rows
    assert row.user_id == identity.user_id
    assert row.client_type == 'web'
    assert row.sign_in_method == 'borderless'
    assert row.device_name == 'Chrome on Linux'
    assert row.ip == seed_e2e.E2E_IP

    payload = decode_token(access_token)
    assert payload['sub'] == str(identity.user_id)
    assert payload['kind'] == 'access'
    assert payload.get('sid') == str(row.id)

    assert uuid.UUID(refresh_token).version == 7
    assert fake_redis.store[f'applika:session:{refresh_token}'] == str(row.id)
    session_hash = fake_redis.hashes[f'applika:session:id:{row.id}']
    assert session_hash['rk'] == refresh_token
    assert session_hash['user_id'] == str(identity.user_id)
    assert 'github_id' not in session_hash
    # Both keys end at the same instant.
    assert (
        fake_redis.expire_at[f'applika:session:{refresh_token}']
        == fake_redis.expire_at[f'applika:session:id:{row.id}']
    )
    # Nothing reads or writes the pre-KODI-057 keys any more (R-023).
    assert not any('refresh_token' in key for key in fake_redis.store)


async def test_minted_cli_session_is_named_and_typed(monkeypatch):
    repo = _fake_sessions(monkeypatch)
    identity = seed_e2e.Identity(user_id=4242)

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
    user = seed_e2e.Identity(user_id=11)
    admin = seed_e2e.Identity(user_id=22)
    discord_user = seed_e2e.Identity(user_id=33)
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
        'borderless',
        'borderless',
        'borderless',
        'cli_device',
    ]
    assert repo.rows[3].user_id == user.user_id
    cli_payload = decode_token(payload['cli_access_token'])
    assert cli_payload['sub'] == str(user.user_id)
    assert cli_payload.get('sid') == str(repo.rows[3].id)
    assert payload['cli_refresh_token'] != payload['refresh_token']
    assert payload['user_id'] == '11'
    assert payload['admin_user_id'] == '22'
    assert payload['discord_user_id'] == '33'
    assert decode_token(payload['access_token'])['sub'] == '11'
    assert decode_token(payload['admin_access_token'])['sub'] == '22'
    assert decode_token(payload['discord_access_token'])['sub'] == '33'
    assert fake_redis.closed is True


def test_main_prints_one_json_line_with_the_contract(monkeypatch, capsys):
    """stdout is exactly one JSON line carrying the eleven string keys."""
    user = seed_e2e.Identity(user_id=11)
    admin = seed_e2e.Identity(user_id=22)
    discord_user = seed_e2e.Identity(user_id=33)

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


def test_e2e_discord_identity():
    """The third seed user keeps its name: the beta specs rely on it."""
    assert seed_e2e.E2E_DISCORD.user.username == 'e2e-discord'
    assert seed_e2e.E2E_DISCORD.user.email == 'e2e-discord@e2e.applika.dev'


# ---------------------------------------------------------------------------
# KODI-052: the beta features are reset on every run
# ---------------------------------------------------------------------------


class FakeFeature:
    def __init__(self, feature_id: int):
        self.id = feature_id


FEATURE_IDS = {'jobs': 77, 'cvs': 88}


class FakeFeatureRepository:
    def __init__(self, features: dict[str, FakeFeature] | None = None):
        self.features = features or {}
        self.calls: list[tuple] = []

    async def get_by_key(self, key: str):
        self.calls.append(('get_by_key', key))
        return self.features.get(key)

    async def set_stage(self, feature_id, stage):
        self.calls.append(('set_stage', feature_id, stage))

    async def add_user(self, feature_id, user_id, added_by):
        self.calls.append(('add_user', feature_id, user_id, added_by))
        return True

    async def remove_user(self, feature_id, user_id):
        self.calls.append(('remove_user', feature_id, user_id))

    async def clear_opt_outs(self, user_id):
        self.calls.append(('clear_opt_outs', user_id))


def _all_features() -> dict[str, FakeFeature]:
    return {key: FakeFeature(fid) for key, fid in FEATURE_IDS.items()}


IDENTITIES = (
    seed_e2e.Identity(user_id=11),
    seed_e2e.Identity(user_id=22),
    seed_e2e.Identity(user_id=33),
)


async def test_reset_beta_features_puts_jobs_and_cvs_back_in_a_known_state(
    monkeypatch,
):
    fake_repo = FakeFeatureRepository(_all_features())
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'FeatureRepository', lambda s: fake_repo)

    await seed_e2e.reset_beta_features(*IDENTITIES)

    assert fake_repo.calls == [
        ('get_by_key', 'jobs'),
        ('get_by_key', 'cvs'),
        ('set_stage', 77, FeatureStage.BETA),
        ('add_user', 77, 11, 22),
        ('remove_user', 77, 33),
        ('set_stage', 88, FeatureStage.BETA),
        ('add_user', 88, 11, 22),
        ('remove_user', 88, 33),
        ('clear_opt_outs', 22),
    ]


@pytest.mark.parametrize(
    ('missing', 'revision'),
    [('jobs', '641001baff09'), ('cvs', 'f28e3d9705dd')],
)
async def test_reset_beta_features_fails_loudly_without_a_feature_row(
    monkeypatch, missing: str, revision: str
):
    features = _all_features()
    del features[missing]
    fake_repo = FakeFeatureRepository(features)
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', lambda: FakeSession())
    monkeypatch.setattr(seed_e2e, 'FeatureRepository', lambda s: fake_repo)

    with pytest.raises(
        RuntimeError,
        match=(
            f'The "{missing}" feature row is missing: run alembic upgrade '
            f'head \\(revision {revision}\\)'
        ),
    ):
        await seed_e2e.reset_beta_features(*IDENTITIES)

    # Nothing is written before every row is found.
    assert all(call[0] == 'get_by_key' for call in fake_repo.calls)


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
