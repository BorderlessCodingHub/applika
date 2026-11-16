"""PKCE S256 (RFC 7636): the challenge of the Borderless sign-in."""

import base64
import hashlib

from app.core.pkce import s256_challenge

RFC_VERIFIER = 'dBjftJeZ4CVP-mJ92K4qrYQ8YKQZbV2sJ-z4aGXSxDQ'
# Precomputed BASE64URL(SHA256(RFC_VERIFIER)), no padding.
RFC_CHALLENGE = '8RRbsH7I9S1LGzqa_QimrNwnASO3-WIHy3QNTLw7thg'


def test_s256_matches_the_precomputed_vector():
    assert s256_challenge(RFC_VERIFIER) == RFC_CHALLENGE


def test_s256_is_unpadded_base64url_of_sha256():
    verifier = 'a' * 50
    expected = (
        base64
        .urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b'=')
        .decode()
    )
    assert s256_challenge(verifier) == expected
    assert '=' not in expected
