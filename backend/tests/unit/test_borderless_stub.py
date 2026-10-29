"""The Borderless stub (``tests/fixtures/borderless/stub.py``) speaks the
shapes ``BorderlessClient`` reads: the real client against the stub on a
loopback port."""

import asyncio
import importlib.util
import json
import threading
from pathlib import Path

import pytest

from app.application.services.borderless_client import (
    BorderlessAccessRefused,
    BorderlessClient,
    BorderlessInvalidCredentials,
)
from app.core.enums import BadgeKey

STUB_DIR = Path(__file__).parents[1] / 'fixtures' / 'borderless'


def _load_stub():
    spec = importlib.util.spec_from_file_location(
        'borderless_stub', STUB_DIR / 'stub.py'
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def stub_url(tmp_path):
    stub = _load_stub()
    accounts = json.loads((STUB_DIR / 'accounts.json').read_text())
    path = tmp_path / 'accounts.json'
    path.write_text(json.dumps(accounts))
    server = stub.serve(path, 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_address[1]}'
    server.shutdown()
    server.server_close()


@pytest.mark.asyncio
async def test_sign_in_and_profile_round_trip(stub_url):
    client = BorderlessClient(base_url=stub_url, timeout=2)
    answer = await client.sign_in(
        'E2E-USER@e2e.applika.dev', 'e2e-user-password'
    )
    assert answer.user_id == 'e2e-borderless-user'
    assert answer.email_verified is True
    assert answer.expires_in == 604800
    assert len(answer.access_token) == 32
    assert await client.read_membership(answer.access_token) is (
        BadgeKey.BORDERLESS_PSP
    )


@pytest.mark.asyncio
async def test_seed_token_is_accepted(stub_url):
    client = BorderlessClient(base_url=stub_url, timeout=2)
    assert await client.read_membership(
        'e2eseedtokenadmin000000000000002'
    ) is (BadgeKey.BORDERLESS_BASE)


@pytest.mark.asyncio
async def test_wrong_password_and_unknown_token_are_refused(stub_url):
    client = BorderlessClient(base_url=stub_url, timeout=2)
    with pytest.raises(BorderlessInvalidCredentials):
        await client.sign_in('e2e-user@e2e.applika.dev', 'wrong')
    with pytest.raises(BorderlessAccessRefused):
        await client.read_membership('unknown-token')


@pytest.mark.asyncio
async def test_expires_in_sequence_is_consumed_and_tokens_expire(stub_url):
    client = BorderlessClient(base_url=stub_url, timeout=2)
    first = await client.sign_in(
        'e2e-short@e2e.applika.dev', 'e2e-short-password'
    )
    assert first.expires_in == 3
    second = await client.sign_in(
        'e2e-short@e2e.applika.dev', 'e2e-short-password'
    )
    assert second.expires_in == 604800
    await asyncio.sleep(3.2)
    with pytest.raises(BorderlessAccessRefused):
        await client.read_membership(first.access_token)
    assert await client.read_membership(second.access_token) is (
        BadgeKey.BORDERLESS_PSP
    )


@pytest.mark.asyncio
async def test_free_and_unverified_accounts(stub_url):
    client = BorderlessClient(base_url=stub_url, timeout=2)
    free = await client.sign_in(
        'e2e-free@e2e.applika.dev', 'e2e-free-password'
    )
    assert await client.read_membership(free.access_token) is None
    unverified = await client.sign_in(
        'e2e-unverified@e2e.applika.dev', 'e2e-unverified-password'
    )
    assert unverified.email_verified is False
