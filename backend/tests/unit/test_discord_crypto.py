"""Unit tests for the Discord refresh-token encryption pair (KODI-024, T093).

Its own Fernet, keyed by ``DISCORD_TOKEN_ENCRYPTION_KEY``, distinct from the
GitHub one: a ciphertext encrypted with one key can never be read back with
the other, and an unset key makes both encrypt and decrypt return ``None``.
"""

from cryptography.fernet import Fernet

from app.config.settings import envs
from app.core.crypto import decrypt_discord_token, encrypt_discord_token


def test_round_trip(monkeypatch):
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    ciphertext = encrypt_discord_token('a-refresh-token')

    assert ciphertext is not None
    assert ciphertext != 'a-refresh-token'
    assert decrypt_discord_token(ciphertext) == 'a-refresh-token'


def test_github_key_cannot_decrypt(monkeypatch):
    github_key = Fernet.generate_key().decode()
    discord_key = Fernet.generate_key().decode()
    monkeypatch.setattr(envs, 'GITHUB_TOKEN_ENCRYPTION_KEY', github_key)
    monkeypatch.setattr(envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', discord_key)

    ciphertext_with_github_key = Fernet(github_key.encode()).encrypt(
        b'a-refresh-token'
    )

    assert decrypt_discord_token(ciphertext_with_github_key.decode()) is None


def test_unset_key_encrypt_returns_none(monkeypatch):
    monkeypatch.setattr(envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', None)

    assert encrypt_discord_token('a-refresh-token') is None


def test_unset_key_decrypt_returns_none(monkeypatch):
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    ciphertext = encrypt_discord_token('a-refresh-token')
    assert ciphertext is not None

    monkeypatch.setattr(envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', None)

    assert decrypt_discord_token(ciphertext) is None


def test_invalid_ciphertext_returns_none(monkeypatch):
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    assert decrypt_discord_token('not-a-valid-token') is None
