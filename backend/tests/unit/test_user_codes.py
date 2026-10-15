"""Device-flow user codes (KODI-057, R-016)."""

import pytest

from app.core.user_codes import (
    ALPHABET,
    LENGTH,
    format_user_code,
    generate_user_code,
    normalize_user_code,
)


def test_alphabet_is_twenty_consonants_without_vowels():
    assert ALPHABET == 'BCDFGHJKLMNPQRSTVWXZ'
    assert len(set(ALPHABET)) == 20
    assert not set(ALPHABET) & set('AEIOUY0123456789')


def test_generated_code_is_eight_letters_of_the_alphabet():
    for _ in range(200):
        code = generate_user_code()
        assert len(code) == LENGTH == 8
        assert set(code) <= set(ALPHABET)


def test_generated_codes_vary():
    assert len({generate_user_code() for _ in range(50)}) > 1


def test_shown_as_two_groups_of_four():
    assert format_user_code('BCDFGHJK') == 'BCDF-GHJK'


@pytest.mark.parametrize(
    'typed',
    ['BCDF-GHJK', 'bcdf-ghjk', 'bcdfghjk', ' BCDF GHJK ', 'bc-df-gh-jk'],
)
def test_case_spaces_and_hyphens_do_not_matter(typed):
    assert normalize_user_code(typed) == 'BCDFGHJK'


@pytest.mark.parametrize(
    'typed',
    ['', 'BCDF-GHJ', 'BCDF-GHJKL', 'ABCD-EFGH', 'BCDF-GHJ1', 'BCDF_GHJK'],
)
def test_anything_else_is_not_a_code(typed):
    assert normalize_user_code(typed) is None
