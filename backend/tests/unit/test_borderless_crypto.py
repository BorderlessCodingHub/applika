"""The Borderless tokens are encrypted with their own Fernet key; an unset
or replaced key reads back as ``None`` (ADR-0026 §6). Decrypting the
refresh token goes through a bounded LRU cache keyed on ``(key,
ciphertext)``: one decrypt per ciphertext, failures never cached, a
rotated token a new entry, a replaced key never a hit."""

import pytest
from cryptography.fernet import Fernet

from app.config.settings import envs
from app.core import crypto
from app.core.crypto import (
    DECRYPT_CACHE_SIZE,
    clear_decrypt_cache,
    decrypt_borderless_token,
    encrypt_borderless_token,
)


def test_round_trip():
    ciphertext = encrypt_borderless_token('opaque-token')
    assert ciphertext is not None
    assert 'opaque-token' not in ciphertext
    assert decrypt_borderless_token(ciphertext) == 'opaque-token'


def test_unset_key_answers_none(monkeypatch: pytest.MonkeyPatch):
    ciphertext = encrypt_borderless_token('opaque-token')
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', None)
    assert encrypt_borderless_token('opaque-token') is None
    assert decrypt_borderless_token(ciphertext or '') is None


def test_malformed_key_answers_none(monkeypatch: pytest.MonkeyPatch):
    ciphertext = encrypt_borderless_token('opaque-token')
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', 'not-a-key')
    assert encrypt_borderless_token('opaque-token') is None
    assert decrypt_borderless_token(ciphertext or '') is None


def test_replaced_key_answers_none(monkeypatch: pytest.MonkeyPatch):
    ciphertext = encrypt_borderless_token('opaque-token')
    monkeypatch.setattr(
        envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    assert decrypt_borderless_token(ciphertext or '') is None


def test_garbage_ciphertext_answers_none():
    assert decrypt_borderless_token('garbage') is None


def _info():
    return crypto._decrypt_borderless_cached.cache_info()


def test_one_decrypt_per_ciphertext():
    ciphertext = encrypt_borderless_token('refresh-1') or ''

    for _ in range(5):
        assert decrypt_borderless_token(ciphertext) == 'refresh-1'

    info = _info()
    assert (info.misses, info.hits) == (1, 4)
    assert info.maxsize == DECRYPT_CACHE_SIZE == 1024


def test_a_failure_is_never_cached(monkeypatch: pytest.MonkeyPatch):
    calls = []
    real = crypto.Fernet

    class CountingFernet(real):
        def decrypt(self, token, ttl=None):
            calls.append(token)
            return super().decrypt(token, ttl)

    monkeypatch.setattr(crypto, 'Fernet', CountingFernet)

    assert decrypt_borderless_token('garbage') is None
    assert decrypt_borderless_token('garbage') is None

    assert len(calls) == 2  # tried again: nothing was cached
    assert _info().currsize == 0


def test_a_rotated_token_is_a_new_entry():
    first = encrypt_borderless_token('refresh-1') or ''
    rotated = encrypt_borderless_token('refresh-2') or ''

    assert decrypt_borderless_token(first) == 'refresh-1'
    assert decrypt_borderless_token(rotated) == 'refresh-2'

    assert _info().currsize == 2
    assert _info().misses == 2


def test_a_replaced_key_never_hits_an_old_entry(
    monkeypatch: pytest.MonkeyPatch,
):
    ciphertext = encrypt_borderless_token('refresh-1') or ''
    assert decrypt_borderless_token(ciphertext) == 'refresh-1'  # cached

    monkeypatch.setattr(
        envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    assert decrypt_borderless_token(ciphertext) is None


def test_clear_forgets_every_entry():
    ciphertext = encrypt_borderless_token('refresh-1') or ''
    decrypt_borderless_token(ciphertext)
    clear_decrypt_cache()
    assert _info().currsize == 0
