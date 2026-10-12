"""Unit tests for the keyword tailoring binding (ADR-0017, R-023..R-025).

The binding only reorders. Every test here compares against the master CV
it started from: the text multiset per section, the order of every section's
entries, the stable ties, and the ``adjustments`` it records.
"""

import ast
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

import app.application.services.keyword_tailoring as keyword_tailoring
from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import (
    CVAdjustment,
    TailoredCVContent,
    TailoringRequest,
)
from app.application.services.clone_tailoring import CloneTailoringService
from app.application.services.keyword_tailoring import KeywordTailoringService
from app.application.services.tailoring import TailoringService
from tests import msg

JD = (
    'We are hiring a backend engineer. Python and PostgreSQL every day; '
    'Kubernetes and AWS in production. Python, Kubernetes.'
)

SECTIONS: dict[str, Any] = {
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://gh/ada'},
        {'id': 'lnk-2', 'label': 'Python blog', 'url': 'https://ada.dev'},
    ],
    'skills': [
        {'id': 'skl-1', 'category': 'Frontend', 'keywords': ['React', 'CSS']},
        {
            'id': 'skl-2',
            'category': 'Languages',
            'keywords': ['Go', 'Rust', 'Python'],
        },
        {
            'id': 'skl-3',
            'category': 'Infra',
            'keywords': ['Terraform', 'Kubernetes', 'AWS', 'Docker'],
        },
    ],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'role': 'Frontend Engineer',
            'start': '2018-01',
            'end': '2020-01',
            'bullets': ['Built a design system', 'Shipped React apps'],
        },
        {
            'id': 'exp-2',
            'company': 'Initech',
            'role': 'Backend Engineer',
            'start': '2020-02',
            'bullets': [
                'Mentored two juniors',
                'Ran Kubernetes on AWS',
                'Wrote Python services on PostgreSQL',
                'Ran Kubernetes upgrades',
            ],
        },
    ],
    'projects': [
        {'id': 'prj-1', 'name': 'Blog', 'description': 'Static site'},
        {'id': 'prj-2', 'name': 'Kube', 'description': 'Kubernetes on AWS'},
    ],
    'education': [
        {
            'id': 'edu-1',
            'institution': 'Art School',
            'degree': 'BA',
            'start': '2010-01',
        },
        {
            'id': 'edu-2',
            'institution': 'Python Institute',
            'degree': 'MSc',
            'start': '2014-01',
        },
    ],
    'certifications': [
        {'id': 'crt-1', 'name': 'Scrum', 'issuer': 'Scrum.org'},
        {'id': 'crt-2', 'name': 'AWS SAA', 'issuer': 'Amazon'},
    ],
    'languages': [
        {'id': 'lng-1', 'name': 'Portuguese', 'level': 'C2'},
        {'id': 'lng-2', 'name': 'English', 'level': 'C1'},
    ],
}


def make_base_cv(**overrides) -> BaseCVDTO:
    return BaseCVDTO.model_validate({
        'id': 10,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'user_id': 1,
        'name': 'Backend CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+351 900 000 000',
        'summary': 'Python and Kubernetes.',
        **SECTIONS,
        **overrides,
    })


async def tailor(base_cv: BaseCVDTO, job_description: str | None):
    return await KeywordTailoringService().tailor(
        TailoringRequest(base_cv=base_cv, job_description=job_description)
    )


def strings(value: Any) -> Counter[str]:
    """Every string anywhere inside ``value``, as a multiset."""
    found: Counter[str] = Counter()
    if isinstance(value, str):
        found[value] += 1
    elif isinstance(value, dict):
        for item in value.values():
            found += strings(item)
    elif isinstance(value, list):
        for item in value:
            found += strings(item)
    return found


# --- R-023: the three reorders, stable ------------------------------------


async def test_matched_keywords_come_first_within_a_category():
    result = await tailor(make_base_cv(), JD)

    by_id = {c.id: c.keywords for c in result.content.skills}
    assert by_id['skl-2'] == ['Python', 'Go', 'Rust'], by_id['skl-2']
    # Ties keep the master's order: Kubernetes before AWS, Terraform before
    # Docker.
    assert by_id['skl-3'] == ['Kubernetes', 'AWS', 'Terraform', 'Docker'], (
        by_id['skl-3']
    )


async def test_categories_with_more_matches_come_first():
    result = await tailor(make_base_cv(), JD)

    order = [c.id for c in result.content.skills]
    assert order == ['skl-3', 'skl-2', 'skl-1'], msg(
        ['skl-3', 'skl-2', 'skl-1'], order
    )


async def test_bullets_with_more_matches_come_first_and_ties_are_stable():
    result = await tailor(make_base_cv(), JD)

    bullets = result.content.experience[1].bullets
    # Two matches each ("kubernetes"+"aws", "python"+"postgresql") keep the
    # master's order; one match next; none last.
    assert bullets == [
        'Ran Kubernetes on AWS',
        'Wrote Python services on PostgreSQL',
        'Ran Kubernetes upgrades',
        'Mentored two juniors',
    ], bullets


async def test_an_entry_without_matches_keeps_its_bullets():
    result = await tailor(make_base_cv(), JD)

    assert result.content.experience[0].bullets == [
        'Built a design system',
        'Shipped React apps',
    ]


# --- R-024: nothing added, removed, rewritten or moved elsewhere ----------


@pytest.mark.parametrize('field', sorted(TailoredCVContent.model_fields))
async def test_every_section_keeps_exactly_the_master_text(field):
    base_cv = make_base_cv()

    result = await tailor(base_cv, JD)

    before = strings(base_cv.model_dump()[field])
    after = strings(result.content.model_dump()[field])
    assert after == before, msg(before, after)


@pytest.mark.parametrize(
    'section',
    [
        'experience',
        'education',
        'projects',
        'certifications',
        'languages',
        'links',
    ],
)
async def test_entries_keep_the_master_order(section):
    base_cv = make_base_cv()

    result = await tailor(base_cv, JD)

    before = [item.id for item in getattr(base_cv, section)]
    after = [item.id for item in getattr(result.content, section)]
    assert after == before, msg(before, after)


async def test_only_skills_and_bullets_differ_from_the_clone():
    base_cv = make_base_cv()
    clone = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv, job_description=JD)
    )

    result = await tailor(base_cv, JD)

    clone_dump = clone.content.model_dump()
    result_dump = result.content.model_dump()
    for field in TailoredCVContent.model_fields:
        if field in ('skills', 'experience'):
            continue
        assert result_dump[field] == clone_dump[field], field
    for before, after in zip(
        clone_dump['experience'], result_dump['experience'], strict=True
    ):
        assert {**after, 'bullets': None} == {**before, 'bullets': None}


async def test_the_master_cv_is_never_mutated():
    base_cv = make_base_cv()
    before = base_cv.model_dump()

    await tailor(base_cv, JD)

    assert base_cv.model_dump() == before


async def test_the_copy_is_never_ai_generated():
    result = await tailor(make_base_cv(), JD)

    assert result.was_ai_generated is False


# --- R-025: adjustments name exactly the sections moved -------------------


async def test_adjustments_name_both_moved_sections():
    result = await tailor(make_base_cv(), JD)

    assert result.adjustments == [
        CVAdjustment(
            section='skills',
            description='Skill categories and keywords reordered by job match',
        ),
        CVAdjustment(
            section='experience',
            description='Bullets reordered by job match in 1 entry',
        ),
    ], result.adjustments


async def test_adjustments_count_every_moved_entry():
    base_cv = make_base_cv(
        experience=[
            {
                'id': f'exp-{i}',
                'company': 'Acme',
                'role': 'Engineer',
                'start': '2020-01',
                'bullets': ['Led meetings', 'Wrote Python'],
            }
            for i in range(2)
        ]
    )

    result = await tailor(base_cv, 'Python')

    assert (
        CVAdjustment(
            section='experience',
            description='Bullets reordered by job match in 2 entries',
        )
        in result.adjustments
    )


async def test_only_keywords_moved_is_recorded_as_such():
    base_cv = make_base_cv(
        skills=[
            {'id': 's1', 'category': 'A', 'keywords': ['Go', 'Python']},
            {'id': 's2', 'category': 'B', 'keywords': ['Java']},
        ],
        experience=[],
    )

    result = await tailor(base_cv, 'Python')

    assert result.adjustments == [
        CVAdjustment(
            section='skills',
            description='Keywords reordered by job match in 1 category',
        )
    ], result.adjustments


async def test_only_categories_moved_is_recorded_as_such():
    base_cv = make_base_cv(
        skills=[
            {'id': 's1', 'category': 'A', 'keywords': ['Java']},
            {'id': 's2', 'category': 'B', 'keywords': ['Python']},
        ],
        experience=[],
    )

    result = await tailor(base_cv, 'Python')

    assert [c.id for c in result.content.skills] == ['s2', 's1']
    assert result.adjustments == [
        CVAdjustment(
            section='skills',
            description='Skill categories reordered by job match',
        )
    ], result.adjustments


async def test_only_bullets_moved_records_experience_only():
    base_cv = make_base_cv(
        skills=[{'id': 's1', 'category': 'A', 'keywords': ['Python']}]
    )

    result = await tailor(base_cv, JD)

    assert [a.section for a in result.adjustments] == ['experience']


async def test_a_job_matching_nothing_moves_nothing():
    base_cv = make_base_cv()
    clone = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv)
    )

    result = await tailor(base_cv, 'Haskell, Erlang and COBOL.')

    assert result.adjustments == []
    assert result.content == clone.content


# --- A blank job description is exactly the clone ---------------------------


@pytest.mark.parametrize('job_description', [None, '', '   \n', 'the and of'])
async def test_a_blank_job_description_is_the_clone(job_description):
    base_cv = make_base_cv()
    clone = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv, job_description=job_description)
    )

    result = await tailor(base_cv, job_description)

    assert result == clone
    assert result.adjustments == []


# --- ADR-0017: the port is unchanged, no model and no network --------------


def test_it_implements_the_unchanged_port():
    service: TailoringService = KeywordTailoringService()

    assert callable(service.tailor)


def test_the_module_imports_only_the_standard_library_and_app():
    source = Path(keyword_tailoring.__file__).read_text()
    roots: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split('.')[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.split('.')[0])

    outside = {
        root
        for root in roots
        if root != 'app' and root not in sys.stdlib_module_names
    }
    assert outside == set(), msg(set(), outside)


async def test_a_bullet_with_more_matches_overtakes_one_with_fewer():
    """Ranked by the number of matches, not just matched or not."""
    base_cv = make_base_cv(
        skills=[],
        experience=[
            {
                'id': 'exp-1',
                'company': 'Acme',
                'role': 'Engineer',
                'start': '2020-01',
                'bullets': ['Python only', 'Python and Docker'],
            }
        ],
    )

    result = await tailor(base_cv, 'Python and Docker')

    assert result.content.experience[0].bullets == [
        'Python and Docker',
        'Python only',
    ]
    assert result.adjustments == [
        CVAdjustment(
            section='experience',
            description='Bullets reordered by job match in 1 entry',
        )
    ]


async def test_a_skill_keyword_matches_when_it_contains_a_job_term():
    """ "React Native" holds the job's "react", so it counts as a match."""
    base_cv = make_base_cv(
        skills=[
            {'id': 's1', 'category': 'A', 'keywords': ['Swift']},
            {
                'id': 's2',
                'category': 'B',
                'keywords': ['Kotlin', 'React Native'],
            },
        ],
        experience=[],
    )

    result = await tailor(base_cv, 'React')

    assert [c.id for c in result.content.skills] == ['s2', 's1']
    assert result.content.skills[0].keywords == ['React Native', 'Kotlin']


async def test_categories_sharing_an_id_are_still_reordered():
    """Sub-item ids are client-generated and not checked for uniqueness."""
    base_cv = make_base_cv(
        skills=[
            {'id': 'dup', 'category': 'A', 'keywords': ['Java']},
            {'id': 'dup', 'category': 'B', 'keywords': ['Python']},
        ],
        experience=[],
    )

    result = await tailor(base_cv, 'Python')

    assert [c.category for c in result.content.skills] == ['B', 'A']
    assert [a.section for a in result.adjustments] == ['skills']
