"""PKCE S256 (RFC 7636) for the Borderless sign-in (ADR-0026 §3)."""

import base64
import hashlib


def s256_challenge(verifier: str) -> str:
    """``BASE64URL(SHA256(verifier))`` without padding."""
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
