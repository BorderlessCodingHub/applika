"""PKCE S256 (KODI-057, R-015)."""

import base64
import hashlib

import pytest

from app.core.pkce import is_valid_challenge, s256_challenge, verify_s256

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


def test_verify_accepts_the_matching_verifier():
    assert verify_s256(RFC_VERIFIER, RFC_CHALLENGE) is True


def test_verify_refuses_another_verifier():
    other = RFC_VERIFIER[:-1] + ('A' if RFC_VERIFIER[-1] != 'A' else 'B')
    assert verify_s256(other, RFC_CHALLENGE) is False


def test_verify_refuses_the_plain_method():
    """``plain`` (challenge == verifier) is not S256: refused."""
    assert verify_s256(RFC_VERIFIER, RFC_VERIFIER) is False


@pytest.mark.parametrize(
    'verifier',
    ['a' * 42, 'a' * 129, 'a' * 42 + '!', 'a' * 43 + ' '],
)
def test_verify_refuses_a_malformed_verifier(verifier):
    assert verify_s256(verifier, s256_challenge(verifier)) is False


@pytest.mark.parametrize('length', [43, 128])
def test_verifier_length_bounds_are_inclusive(length):
    verifier = 'a' * length
    assert verify_s256(verifier, s256_challenge(verifier)) is True


@pytest.mark.parametrize(
    ('challenge', 'valid'),
    [
        (RFC_CHALLENGE, True),
        ('A' * 43, True),
        ('A' * 128, True),
        ('A' * 42, False),
        ('A' * 129, False),
        ('A' * 42 + '=', False),
        ('A' * 42 + '+', False),
        ('A' * 42 + '/', False),
        ('A' * 42 + '.', False),
        ('', False),
    ],
)
def test_challenge_is_43_to_128_base64url(challenge, valid):
    assert is_valid_challenge(challenge) is valid
