import re

from applika.lib import pkce

BASE64URL = re.compile(r'^[A-Za-z0-9_-]+$')


def test_verifier_is_86_base64url_characters_and_random():
    verifier = pkce.generate_verifier()

    assert len(verifier) == 86
    assert 43 <= len(verifier) <= 128
    assert BASE64URL.match(verifier)
    assert pkce.generate_verifier() != verifier


def test_s256_challenge_matches_rfc_7636_appendix_b():
    verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

    assert (
        pkce.s256_challenge(verifier)
        == 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    )


def test_challenge_is_43_characters_without_padding():
    challenge = pkce.s256_challenge(pkce.generate_verifier())

    assert len(challenge) == 43
    assert '=' not in challenge
    assert BASE64URL.match(challenge)


def test_state_is_random_base64url():
    state = pkce.generate_state()

    assert BASE64URL.match(state)
    assert len(state) >= 32
    assert pkce.generate_state() != state
