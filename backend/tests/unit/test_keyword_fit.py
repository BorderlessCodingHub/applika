"""Unit tests for the keyword fit (ADR-0017, PRD 0012 R-013/R-014).

The fit is pure: the job's keywords, the CV's text and the score are three
plain functions, so every rule is pinned here without a database.
"""

from datetime import datetime, timezone
from typing import Any

import pytest

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import TailoredCVContent
from app.application.services.keyword_fit import (
    TOP_PAIRS,
    TOP_TERMS,
    FitResult,
    cv_text,
    job_keywords,
    matched_keywords,
    score_fit,
)
from tests import msg

EMPTY_CV: dict[str, Any] = {
    'name': 'CV',
    'full_name': 'Ada Lovelace',
    'headline': '',
    'location': 'Lisbon',
    'email': 'ada@example.com',
    'summary': '',
}


def make_content(**overrides) -> TailoredCVContent:
    return TailoredCVContent(**{**EMPTY_CV, **overrides})


# --- score_fit ---------------------------------------------------------------


def test_score_is_zero_when_nothing_matches():
    result = score_fit(['python', 'rust'], 'Go and Java')

    assert result == FitResult(
        score=0, matched=[], missing=['python', 'rust']
    ), msg(0, result)


def test_score_is_100_when_everything_matches():
    result = score_fit(['python', 'rust'], 'Rust and Python')

    assert result.score == 100, msg(100, result.score)
    assert result.matched == ['python', 'rust']
    assert result.missing == []


@pytest.mark.parametrize(
    ('matched', 'total', 'expected'),
    [(1, 3, 33), (2, 3, 67), (1, 8, 13), (3, 8, 38), (1, 6, 17)],
)
def test_score_is_rounded_to_a_whole_number(matched, total, expected):
    """round(100 x matched / total), halves up (1/8 = 12.5 -> 13)."""
    keywords = [f'kw{i}' for i in range(total)]
    text = ' '.join(keywords[:matched])

    result = score_fit(keywords, text)

    assert result.score == expected, msg(expected, result.score)
    assert isinstance(result.score, int)


def test_score_without_keywords_is_none():
    assert score_fit([], 'Python everywhere').score is None


def test_blank_text_and_no_tags_give_no_score():
    """A blank job description and no tags: no fit, not a fake 0."""
    keywords = job_keywords('   ', [])

    result = score_fit(keywords, 'Python')

    assert keywords == []
    assert result == FitResult(score=None, matched=[], missing=[])


def test_same_input_gives_the_same_output():
    """R-014: fixed rules, the same CV and job always give the same score."""
    jd = 'Python, FastAPI and PostgreSQL. Python on AWS with Docker.'
    content = make_content(
        headline='Python Engineer', summary='FastAPI and Docker.'
    )

    first = score_fit(job_keywords(jd, ['Kubernetes']), cv_text(content))
    second = score_fit(job_keywords(jd, ['Kubernetes']), cv_text(content))

    assert first == second
    assert first.score is not None
    assert 0 <= first.score <= 100


def test_matching_is_case_insensitive():
    assert score_fit(['postgresql'], 'POSTGRESQL and PostgreSQL').score == 100


def test_matching_is_on_whole_words():
    """``java`` is not found inside ``javascript``."""
    assert score_fit(['java'], 'JavaScript').score == 0


def test_a_pair_matches_only_as_a_whole_phrase():
    assert matched_keywords(['machine learning'], 'Machine learning') == [
        'machine learning'
    ]
    assert matched_keywords(['machine learning'], 'learning machine') == []
    # Two separate lines are two separate phrases.
    assert matched_keywords(['machine learning'], 'machine\nlearning') == []


# --- job_keywords ------------------------------------------------------------


def test_stop_words_are_dropped():
    keywords = job_keywords('The team is looking for a Python developer', [])

    for stop_word in ('the', 'team', 'is', 'looking', 'for', 'a'):
        assert stop_word not in keywords, f'{stop_word} kept: {keywords}'
    assert 'python' in keywords
    assert 'developer' in keywords


def test_a_word_pair_is_counted():
    keywords = job_keywords('Machine learning. Machine learning at scale.', [])

    assert 'machine learning' in keywords, keywords


def test_a_stop_word_breaks_a_pair():
    """ "design of systems" is no phrase of the posting: no pair is made."""
    keywords = job_keywords('design of systems', [])

    assert keywords == ['design', 'systems'], keywords


def test_punctuation_breaks_a_pair():
    keywords = job_keywords('Python, Rust', [])

    assert 'python rust' not in keywords, keywords


def test_a_tag_counts_even_when_absent_from_the_text():
    keywords = job_keywords('Python developer', ['  Kubernetes ', 'AWS'])

    assert keywords[-2:] == ['kubernetes', 'aws'], keywords


def test_a_tag_already_in_the_text_is_listed_once():
    keywords = job_keywords('Python developer', ['Python'])

    assert keywords.count('python') == 1, keywords


def test_blank_tags_are_ignored():
    assert job_keywords('', ['  ', '']) == []


def test_terms_rank_by_frequency_then_alphabetically():
    keywords = job_keywords('zeta zeta. alpha. beta. beta.', [])

    assert keywords[:3] == ['beta', 'zeta', 'alpha'], keywords


def test_at_most_25_terms_and_25_pairs():
    words = [f'w{chr(97 + i // 26)}{chr(97 + i % 26)}' for i in range(40)]
    text = ' '.join(words)

    keywords = job_keywords(text, [])

    terms = [k for k in keywords if ' ' not in k]
    pairs = [k for k in keywords if ' ' in k]
    assert len(terms) == TOP_TERMS, msg(TOP_TERMS, len(terms))
    assert len(pairs) == TOP_PAIRS, msg(TOP_PAIRS, len(pairs))


def test_tech_terms_survive_tokenizing():
    keywords = job_keywords('C++, C#, Node.js and full-stack. R.', [])

    for term in ('c++', 'c#', 'node.js', 'full-stack', 'r'):
        assert term in keywords, f'{term} lost: {keywords}'


def test_single_letters_other_than_c_and_r_are_noise():
    assert job_keywords('x y z', []) == []


# --- cv_text: the fields that count, and the ones that never do ---------------


@pytest.mark.parametrize(
    'overrides',
    [
        {'headline': 'Kubernetes engineer'},
        {'summary': 'I run Kubernetes.'},
        {
            'skills': [
                {'id': 's', 'category': 'Ops', 'keywords': ['Kubernetes']}
            ]
        },
        {
            'experience': [
                {
                    'id': 'e',
                    'company': 'Acme',
                    'role': 'Kubernetes Admin',
                    'start': '2020-01',
                }
            ]
        },
        {
            'experience': [
                {
                    'id': 'e',
                    'company': 'Acme',
                    'role': 'Admin',
                    'start': '2020-01',
                    'bullets': ['Ran Kubernetes'],
                }
            ]
        },
        {'projects': [{'id': 'p', 'name': 'Kubernetes', 'description': 'x'}]},
        {
            'projects': [
                {'id': 'p', 'name': 'Tool', 'description': 'On Kubernetes'}
            ]
        },
        {
            'certifications': [
                {'id': 'c', 'name': 'Kubernetes CKA', 'issuer': 'CNCF'}
            ]
        },
    ],
    ids=[
        'headline',
        'summary',
        'skill keywords',
        'experience role',
        'experience bullets',
        'project name',
        'project description',
        'certifications',
    ],
)
def test_a_cv_field_that_counts(overrides):
    result = score_fit(['kubernetes'], cv_text(make_content(**overrides)))

    assert result.score == 100, msg(100, result)


@pytest.mark.parametrize(
    'overrides',
    [
        {'email': 'kubernetes@example.com'},
        {'full_name': 'Kubernetes Lovelace', 'name': 'Kubernetes CV'},
        {'location': 'Kubernetes'},
        {'phone': 'kubernetes'},
        {
            'links': [
                {'id': 'l', 'label': 'Kubernetes', 'url': 'https://k8s.io'}
            ]
        },
        {
            'education': [
                {
                    'id': 'd',
                    'institution': 'Kubernetes U',
                    'degree': 'Kubernetes',
                    'area': 'Kubernetes',
                    'start': '2010-01',
                }
            ]
        },
        {'languages': [{'id': 'g', 'name': 'Kubernetes', 'level': 'C2'}]},
        {'skills': [{'id': 's', 'category': 'Kubernetes', 'keywords': ['Go']}]},
        {
            'experience': [
                {
                    'id': 'e',
                    'company': 'Kubernetes Inc',
                    'company_description': 'Kubernetes',
                    'location': 'Kubernetes',
                    'role': 'Admin',
                    'start': '2020-01',
                }
            ]
        },
    ],
    ids=[
        'email',
        'name and label',
        'location',
        'phone',
        'links',
        'education',
        'languages',
        'skill category name',
        'experience company',
    ],
)
def test_a_cv_field_that_never_counts(overrides):
    result = score_fit(['kubernetes'], cv_text(make_content(**overrides)))

    assert result.score == 0, msg(0, result)


def test_cv_text_takes_a_master_cv_too():
    base_cv = BaseCVDTO.model_validate({
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'user_id': 1,
        **EMPTY_CV,
        'headline': 'Rust engineer',
    })

    assert score_fit(['rust'], cv_text(base_cv)).score == 100


# --- Tags with punctuation, and the gaps between words ------------------------


@pytest.mark.parametrize(
    ('tag', 'text'),
    [
        ('CI/CD', 'Built CI/CD pipelines'),
        ('UI/UX', 'Led UI / UX research'),
        ('Go (Golang)', 'Wrote Go (Golang) services'),
        ('R&D', 'Ran the R&D lab'),
        ('Node.js', 'Node.js and TypeScript'),
    ],
)
def test_a_tag_with_punctuation_matches_as_written(tag, text):
    keywords = job_keywords('', [tag])

    assert keywords == [' '.join(tag.split()).lower()], keywords
    assert score_fit(keywords, text).score == 100


def test_a_tag_with_punctuation_needs_the_same_punctuation():
    assert score_fit(job_keywords('', ['CI/CD']), 'CI and CD').score == 0


@pytest.mark.parametrize('tag', ['-', '#', 'the', 'x', ',', '?!', ' . '])
def test_a_punctuation_only_or_lone_stop_word_tag_is_dropped(tag):
    """``-`` never matches; ``the`` and a stray letter say nothing."""
    assert job_keywords('', [tag]) == []


# --- KODI-046 widening (owner, 2026-10-12): digits, any script, ``.NET``,
# ``Python,`` and ``machine- learning`` -------------------------------------


@pytest.mark.parametrize(
    ('tag', 'keyword', 'found_in', 'not_in'),
    [
        ('5G', '5g', 'Built 5G radio stacks', 'Plan G subscribers'),
        ('3D', '3d', 'Real-time 3D rendering', 'D3 charts in 2D'),
        ('2FA', '2fa', 'Shipped 2FA for every login', 'The FA cup'),
        ('Vue 3', 'vue 3', 'Vue 3 and Pinia', 'Vue 2, 3 years'),
        ('Résumé', 'résumé', 'RÉSUMÉ parsing service', 'Resume parsing'),
        ('Português', 'português', 'Fluent in Português', 'Portugues'),
    ],
)
def test_a_tag_with_digits_or_non_ascii_letters_is_kept_and_matched(
    tag, keyword, found_in, not_in
):
    keywords = job_keywords('', [tag])

    assert keywords == [keyword], keywords
    assert score_fit(keywords, found_in).score == 100
    assert score_fit(keywords, not_in).score == 0


@pytest.mark.parametrize(
    'text', ['Built C#/.NET services', '.NET 8 on Azure', 'Senior (.NET)']
)
def test_dot_net_matches_dot_net(text):
    assert job_keywords('', ['.NET']) == ['.net']
    assert matched_keywords(['.net'], text) == ['.net']


@pytest.mark.parametrize(
    'text', ['Net income grew', 'Grew net revenue', 'Visit acme.net today']
)
def test_dot_net_never_matches_a_bare_net(text):
    assert score_fit(job_keywords('', ['.NET']), text).score == 0


def test_dot_net_in_a_posting_is_the_term_dot_net():
    keywords = job_keywords('Senior .NET engineer. We love .NET.', [])

    assert '.net' in keywords, keywords
    assert 'net' not in keywords, keywords


def test_a_sentence_end_before_net_is_no_leading_dot():
    """``end. Net`` is a full stop, then a word: the dot is not glued."""
    keywords = job_keywords('Ship it. Net promoter score. Net promoter.', [])

    assert 'net' in keywords, keywords
    assert '.net' not in keywords, keywords


@pytest.mark.parametrize(
    'tags', [['Python,'], ['python;'], [' Python. '], ['Python!', 'python']]
)
def test_sentence_punctuation_around_a_tag_is_dropped_and_deduplicated(tags):
    assert job_keywords('', tags) == ['python']


def test_a_comma_tag_deduplicates_against_the_job_term():
    keywords = job_keywords('Python services in Python.', ['Python,'])

    assert keywords.count('python') == 1, keywords
    assert 'python,' not in keywords, keywords


def test_a_trailing_dot_is_dropped_but_an_inner_one_kept():
    assert job_keywords('', ['Node.js.']) == ['node.js']


@pytest.mark.parametrize(
    'text', ['Machine- learning. Machine- learning.', 'Machine -learning.']
)
def test_a_dangling_hyphen_never_forms_a_word_pair(text):
    keywords = job_keywords(text, [])

    assert 'machine learning' not in keywords, keywords


def test_a_dangling_hyphen_hides_the_pair_in_the_cv_too():
    assert matched_keywords(['machine learning'], 'machine- learning') == []
    assert matched_keywords(['machine learning'], 'machine learning') == [
        'machine learning'
    ]


def test_a_hyphenated_word_is_still_one_term():
    assert job_keywords('Machine-learning, machine-learning.', []) == [
        'machine-learning'
    ]


def test_a_token_without_a_letter_is_never_a_term():
    """``5 years``, ``2024`` and ``10+``: numbers alone say nothing."""
    keywords = job_keywords('5 years in 2024 with 10+ Python engineers', [])

    assert keywords == ['engineers', 'python', 'years', 'python engineers']


def test_a_number_breaks_a_pair_like_a_stop_word():
    assert 'python 3' not in job_keywords('Python 3. Python 3.', [])


def test_words_in_other_scripts_stay_whole():
    """No more ``experi`` / ``ncia`` fragments."""
    keywords = job_keywords('Experiência em Python. Experiência.', [])

    assert keywords[0] == 'experiência', keywords
    assert 'experi' not in keywords
    assert 'ncia' not in keywords


def test_an_underscore_still_splits_words():
    assert matched_keywords(['snake'], 'snake_case') == ['snake']


def test_a_pair_never_matches_across_punctuation():
    assert matched_keywords(['machine learning'], 'machine, learning') == []


def test_non_breaking_spaces_are_spaces():
    """A posting pasted from a web page keeps its U+00A0 spaces."""
    keywords = job_keywords('Machine\xa0learning. Machine\xa0learning.', [])

    assert 'machine learning' in keywords, keywords
    assert matched_keywords(['machine learning'], 'Machine\xa0learning') == [
        'machine learning'
    ]


def test_a_certification_issuer_counts():
    content = make_content(
        certifications=[{'id': 'c', 'name': 'CKA', 'issuer': 'Kubernetes'}]
    )

    assert score_fit(['kubernetes'], cv_text(content)).score == 100


@pytest.mark.parametrize(
    ('keyword', 'text'),
    [
        ('docker', 'Python, Docker'),
        ('machine learning', 'Built (machine learning) tools'),
        ('python', 'Built APIs (Python)'),
    ],
)
def test_punctuation_before_a_keyword_does_not_hide_it(keyword, text):
    """Only the punctuation *between* a keyword's words is compared."""
    assert matched_keywords([keyword], text) == [keyword]


def test_a_phrase_never_spans_two_cv_fields():
    content = make_content(headline='Senior machine', summary='Learning fast.')

    assert matched_keywords(['machine learning'], cv_text(content)) == []


def test_inner_whitespace_in_a_tag_is_collapsed():
    assert job_keywords('', ['  Machine \t  Learning ']) == ['machine learning']
