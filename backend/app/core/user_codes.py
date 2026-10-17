"""Device-flow user codes (KODI-057, RFC 8628 section 6.1).

Eight letters from a 20-consonant alphabet (no vowels, so no words; no
look-alike digits), shown as ``XXXX-XXXX``. Input is normalised: case,
spaces and hyphens do not matter.
"""

import re
import secrets

ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
LENGTH = 8

_NOISE_RE = re.compile(r'[\s-]+')
_CODE_RE = re.compile(f'[{ALPHABET}]{{{LENGTH}}}')


def generate_user_code() -> str:
    """A fresh normalised code (eight letters, no hyphen)."""
    return ''.join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def format_user_code(code: str) -> str:
    """``BCDFGHJK`` -> ``BCDF-GHJK``."""
    half = LENGTH // 2
    return f'{code[:half]}-{code[half:]}'


def normalize_user_code(raw: str) -> str | None:
    """The stored form of what a user typed, or ``None`` if it cannot be a
    code."""
    code = _NOISE_RE.sub('', raw).upper()
    if _CODE_RE.fullmatch(code) is None:
        return None
    return code
