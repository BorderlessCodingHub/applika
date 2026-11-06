"""The Borderless access token is encrypted with its own Fernet key; an
unset or replaced key reads back as ``None``."""

import pytest
from cryptography.fernet import Fernet

from app.config.settings import envs
from app.core.crypto import decrypt_borderless_token, encrypt_borderless_token


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
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', 'not-a-key')
    assert encrypt_borderless_token('opaque-token') is None


def test_replaced_key_answers_none(monkeypatch: pytest.MonkeyPatch):
    ciphertext = encrypt_borderless_token('opaque-token')
    monkeypatch.setattr(
        envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    assert decrypt_borderless_token(ciphertext or '') is None


def test_garbage_ciphertext_answers_none():
    assert decrypt_borderless_token('garbage') is None
