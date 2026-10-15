"""PKCE (RFC 7636) for `applika login` (KODI-060, ADR-0019).

The verifier stays on this machine; only its S256 challenge goes to
``GET /auth/cli/authorize``. The verifier is sent once, with the code, on
the ``authorization_code`` grant of ``POST /auth/token``.
"""

import base64
import hashlib
import secrets


def generate_verifier() -> str:
    """A high-entropy verifier: 64 random bytes, 86 base64url characters
    (RFC 7636 allows 43 to 128)."""
    return secrets.token_urlsafe(64)


def s256_challenge(verifier: str) -> str:
    """``BASE64URL(SHA256(ASCII(verifier)))`` without padding."""
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64.urlsafe_b64encode(digest).decode('ascii').rstrip('=')


def generate_state() -> str:
    """The anti-forgery value echoed back with the code."""
    return secrets.token_urlsafe(24)
