"""Fernet-based encryption for sensitive tokens.

Used to encrypt/decrypt GitHub access tokens stored in the database.
The encryption key must be a valid Fernet key (base64-encoded 32 bytes).
Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
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
