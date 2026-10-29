"""Fernet encryption for the stored Borderless access token (ADR-0024).

Keyed by ``BORDERLESS_TOKEN_ENCRYPTION_KEY`` (a base64 32-byte Fernet key).
Generate one with:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

An unset key makes both functions answer ``None`` rather than raise; a
ciphertext written with another key also decrypts to ``None``, which the
badge refresh turns into ``needs_reconnect``.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.config.settings import envs


def _get_fernet() -> Fernet | None:
    key = envs.BORDERLESS_TOKEN_ENCRYPTION_KEY
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except ValueError:
        return None


def encrypt_borderless_token(plaintext: str) -> str | None:
    """Encrypt a Borderless access token. ``None`` when the key is unset."""
    fernet = _get_fernet()
    if fernet is None:
        return None
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_borderless_token(ciphertext: str) -> str | None:
    """Decrypt a Borderless access token.

    ``None`` when the key is unset, the ciphertext is invalid, or it was
    written with a different key.
    """
    fernet = _get_fernet()
    if fernet is None:
        return None
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return None
