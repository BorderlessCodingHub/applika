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
