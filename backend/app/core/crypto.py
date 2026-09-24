"""Fernet-based encryption for sensitive tokens.

Used to encrypt/decrypt GitHub access tokens stored in the database.
The encryption key must be a valid Fernet key (base64-encoded 32 bytes).
Generate one with:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

``encrypt_discord_token``/``decrypt_discord_token`` (KODI-024, ADR-0013) are a
separate pair, keyed by their own ``DISCORD_TOKEN_ENCRYPTION_KEY`` - the
Discord refresh token is never encrypted with the GitHub key, and a ciphertext
produced with one key can never be read back with the other.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.config.settings import envs


def _get_fernet() -> Fernet:
    return Fernet(envs.GITHUB_TOKEN_ENCRYPTION_KEY.encode())


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext token and return the ciphertext as a string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str | None:
    """Decrypt a ciphertext token. Returns None if decryption fails."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return None


def _get_discord_fernet() -> Fernet | None:
    """None when ``DISCORD_TOKEN_ENCRYPTION_KEY`` is unset - the caller then
    treats every encrypt/decrypt as unavailable rather than raising."""
    key = envs.DISCORD_TOKEN_ENCRYPTION_KEY
    if not key:
        return None
    return Fernet(key.encode())


def encrypt_discord_token(plaintext: str) -> str | None:
    """Encrypt a Discord refresh token. ``None`` when the key is unset."""
    fernet = _get_discord_fernet()
    if fernet is None:
        return None
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_discord_token(ciphertext: str) -> str | None:
    """Decrypt a Discord refresh token.

    ``None`` when the key is unset, when the ciphertext is invalid, or when
    it was encrypted with a different key (including the GitHub one).
    """
    fernet = _get_discord_fernet()
    if fernet is None:
        return None
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return None
