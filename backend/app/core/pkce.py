"""PKCE S256 (RFC 7636) for the CLI browser sign-in (KODI-057, ADR-0019).

Only ``S256`` is accepted. A challenge is 43 to 128 base64url characters; a
verifier is 43 to 128 of RFC 7636's unreserved characters.
"""

import base64
import hashlib
import hmac
import re

S256 = 'S256'

_CHALLENGE_RE = re.compile(r'[A-Za-z0-9_-]{43,128}')
_VERIFIER_RE = re.compile(r'[A-Za-z0-9._~-]{43,128}')


def is_valid_challenge(challenge: str) -> bool:
    return _CHALLENGE_RE.fullmatch(challenge) is not None


def s256_challenge(verifier: str) -> str:
    """``BASE64URL(SHA256(verifier))`` without padding."""
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


def verify_s256(verifier: str, challenge: str) -> bool:
    """True when ``verifier`` is well formed and hashes to ``challenge``."""
    if _VERIFIER_RE.fullmatch(verifier) is None:
        return False
    return hmac.compare_digest(s256_challenge(verifier), challenge)
