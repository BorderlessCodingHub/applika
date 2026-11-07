"""Fernet encryption for the Borderless tokens (ADR-0026 §6).

Keyed by ``BORDERLESS_TOKEN_ENCRYPTION_KEY`` (a base64 32-byte Fernet key).
Generate one with:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

The refresh token is stored encrypted in ``borderless_accounts`` and
decrypted only when it is used; the access token is stored encrypted in
Redis and never decrypted by applika. An unset key makes both functions
answer ``None`` rather than raise; a ciphertext written with another key
also decrypts to ``None``, which the membership refresh handles like a
refused grant.

Decrypting goes through a bounded in-process LRU cache keyed on
``(key, ciphertext)``: the same refresh token is not decrypted again and
again, a rotated token is a new ciphertext (a new entry; the old one ages
out), a replaced key never hits an entry made with the old one, and a
failure is never cached. Up to 1024 plaintext refresh tokens per API
process; whoever can read that memory already holds the key from the
environment.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config.settings import envs

DECRYPT_CACHE_SIZE = 1024


def _get_fernet() -> Fernet | None:
    key = envs.BORDERLESS_TOKEN_ENCRYPTION_KEY
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except ValueError:
        return None


def encrypt_borderless_token(plaintext: str) -> str | None:
    """Encrypt a Borderless token. ``None`` when the key is unset."""
    fernet = _get_fernet()
    if fernet is None:
        return None
    return fernet.encrypt(plaintext.encode()).decode()


@lru_cache(maxsize=DECRYPT_CACHE_SIZE)
def _decrypt_borderless_cached(key: str, ciphertext: str) -> str:
    """Raises on a bad key or ciphertext: an exception is never cached."""
    return Fernet(key.encode()).decrypt(ciphertext.encode()).decode()


def decrypt_borderless_token(ciphertext: str) -> str | None:
    """Decrypt the stored Borderless refresh token.

    ``None`` when the key is unset, the ciphertext is invalid, or it was
    written with a different key.
    """
    key = envs.BORDERLESS_TOKEN_ENCRYPTION_KEY
    if not key:
        return None
    try:
        return _decrypt_borderless_cached(key, ciphertext)
    except InvalidToken, ValueError:
        return None


def clear_decrypt_cache() -> None:
    """Forget every cached plaintext (tests; a key rotation restarts the
    process anyway)."""
    _decrypt_borderless_cached.cache_clear()
