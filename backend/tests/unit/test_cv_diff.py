"""Unit tests for the pure CV diff function (KODI-017, T091).

The shared fixtures (``tests/unit/test_cv_diff_fixtures.py``) pin the
canonical JSON shape end to end; these tests exercise the branches the
fixture set does not spell out one by one - every identity field, every
list-section's own item fields, and that ``total`` is always the sum of
``sections``.
"""

from typing import Any

from app.application.dto.tailored_cv import TailoredCVContent
from app.application.services.cv_diff import (
    ADDED,
    CERTIFICATIONS_SECTION,
    CHANGED,
    EDUCATION_SECTION,
    EXPERIENCE_SECTION,
    IDENTITY_SECTION,
    KEYWORD_ADDED,
    KEYWORD_REMOVED,
    LANGUAGES_SECTION,
    LINKS_SECTION,
    PROJECTS_SECTION,
    REMOVED,
    SKILLS_SECTION,
    SUMMARY_SECTION,
    diff_cv,
)

FULL: dict[str, Any] = {
    'name': 'Backend CV',
    'full_name': 'Ada Example',
    'headline': 'Staff Backend Engineer',
    'location': 'Lisbon, PT',
    'email': 'ada@example.com',
    'phone': '+1 202 555 0147',
    'summary': 'Ten years of backend engineering.',
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'}
    ],
    'skills': [
        {'id': 'skl-1', 'category': 'Languages', 'keywords': ['Python']}
    ],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'company_description': 'Anvils, mostly',
            'role': 'Staff Engineer',
            'location': 'Lisbon, PT',
            'start': '2024-02',
            'end': None,
            'bullets': ['Cut p99 by half'],
        }
    ],
    'projects': [
        {
            'id': 'prj-1',
            'name': 'applika',
            'description': 'Job application tracker',
            'link': 'https://applika.example.com',
            'link_label': 'applika.example.com',
        }
    ],
    'education': [
        {
            'id': 'edu-1',
            'institution': 'Riverside Institute',
            'degree': "Master's degree",
            'area': 'Distributed Systems',
            'start': '2016-09',
            'end': '2018-07',
        }
    ],
    'certifications': [{'id': 'crt-1', 'name': 'AWS SAA', 'issuer': 'Amazon'}],
    'languages': [{'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'}],
}


def _content(**overrides: Any) -> TailoredCVContent:
    body = {**FULL, **overrides}
    return TailoredCVContent(**body)


def test_identical_documents_produce_zero_changes():
    result = diff_cv(_content(), _content())
    assert result.total == 0
    assert result.changes == []
    assert set(result.sections) == {
        'identity',
        'links',
        'summary',
        'experience',
        'languages',
        'skills',
        'projects',
        'education',
        'certifications',
    }
    assert all(count == 0 for count in result.sections.values())


def test_total_always_equals_the_sum_of_sections():
    baseline = _content()
    current = _content(
        headline='Principal Engineer',
        summary='Twelve years.',
    )
    result = diff_cv(baseline, current)
    assert result.total == sum(result.sections.values())
    assert result.total == 2


def test_every_identity_field_is_diffed_independently():
    for field, new_value in [
        ('name', 'Renamed CV'),
        ('full_name', 'Grace Example'),
        ('headline', 'Principal Engineer'),
        ('location', 'Porto, PT'),
        ('email', 'grace@example.com'),
        ('phone', '+351 900 000 000'),
    ]:
        baseline = _content()
        current = _content(**{field: new_value})
        result = diff_cv(baseline, current)
        assert result.total == 1, field
        assert result.sections[IDENTITY_SECTION] == 1, field
        assert result.changes[0].path == field, field
        assert result.changes[0].kind == CHANGED, field


def test_summary_change_is_its_own_section():
    baseline = _content()
    current = _content(summary='A different summary entirely.')
    result = diff_cv(baseline, current)
    assert result.total == 1
    assert result.sections[SUMMARY_SECTION] == 1
    change = result.changes[0]
    assert change.section == SUMMARY_SECTION
    assert change.path == 'summary'


def test_link_item_fields_are_diffed_by_id():
    baseline = _content()
    current = _content(
        links=[
            {
                'id': 'lnk-1',
                'label': 'GitHub Profile',
                'url': 'https://github.com/ada',
            }
        ]
    )
    result = diff_cv(baseline, current)
    assert result.sections[LINKS_SECTION] == 1
    assert result.changes[0].path == 'links:lnk-1.label'
    assert result.changes[0].before == 'GitHub'
    assert result.changes[0].after == 'GitHub Profile'


def test_link_item_added_and_removed():
    baseline = _content()
    current = _content(
        links=[
            *FULL['links'],
            {'id': 'lnk-2', 'label': 'Site', 'url': 'https://ada.example.com'},
        ]
    )
    result = diff_cv(baseline, current)
    assert result.sections[LINKS_SECTION] == 1
    change = result.changes[0]
    assert change.kind == ADDED
    assert change.path == 'links:lnk-2'
    assert change.before is None
    assert change.after == {
        'id': 'lnk-2',
        'label': 'Site',
        'url': 'https://ada.example.com',
    }

    result = diff_cv(current, baseline)
    change = result.changes[0]
    assert change.kind == REMOVED
    assert change.path == 'links:lnk-2'
    assert change.after is None


def test_experience_bullets_change_as_one_whole_value():
    baseline = _content()
    current = _content(
        experience=[
            {
                **FULL['experience'][0],
                'bullets': ['Cut p99 by half', 'Led the platform team'],
            }
        ]
    )
    result = diff_cv(baseline, current)
    assert result.sections[EXPERIENCE_SECTION] == 1
    change = result.changes[0]
    assert change.path == 'experience:exp-1.bullets'
    assert change.kind == CHANGED


def test_project_item_fields_are_diffed():
    baseline = _content()
    current = _content(
        projects=[{**FULL['projects'][0], 'description': 'New description'}]
    )
    result = diff_cv(baseline, current)
    assert result.sections[PROJECTS_SECTION] == 1
    assert result.changes[0].path == 'projects:prj-1.description'


def test_education_item_fields_are_diffed():
    baseline = _content()
    current = _content(
        education=[{**FULL['education'][0], 'degree': 'Doctorate'}]
    )
    result = diff_cv(baseline, current)
    assert result.sections[EDUCATION_SECTION] == 1
    assert result.changes[0].path == 'education:edu-1.degree'


def test_certification_item_fields_are_diffed():
    baseline = _content()
    current = _content(
        certifications=[{**FULL['certifications'][0], 'issuer': 'AWS'}]
    )
    result = diff_cv(baseline, current)
    assert result.sections[CERTIFICATIONS_SECTION] == 1
    assert result.changes[0].path == 'certifications:crt-1.issuer'


def test_language_item_fields_are_diffed():
    baseline = _content()
    current = _content(languages=[{**FULL['languages'][0], 'level': 'C2'}])
    result = diff_cv(baseline, current)
    assert result.sections[LANGUAGES_SECTION] == 1
    assert result.changes[0].path == 'languages:lng-1.level'


def test_skill_keywords_diff_as_a_set_per_category():
    baseline = _content()
    current = _content(
        skills=[
            {
                'id': 'skl-1',
                'category': 'Languages',
                'keywords': ['Python', 'Go'],
            }
        ]
    )
    result = diff_cv(baseline, current)
    assert result.sections[SKILLS_SECTION] == 1
    change = result.changes[0]
    assert change.kind == KEYWORD_ADDED
    assert change.path == 'skills:skl-1.keywords:Go'
    assert change.after == 'Go'

    result = diff_cv(current, baseline)
    change = result.changes[0]
    assert change.kind == KEYWORD_REMOVED
    assert change.path == 'skills:skl-1.keywords:Go'
    assert change.before == 'Go'


def test_skill_category_added_and_removed_whole():
    baseline = _content()
    current = _content(
        skills=[
            *FULL['skills'],
            {'id': 'skl-2', 'category': 'Tools', 'keywords': ['Docker']},
        ]
    )
    result = diff_cv(baseline, current)
    assert result.sections[SKILLS_SECTION] == 1
    change = result.changes[0]
    assert change.kind == ADDED
    assert change.path == 'skills:skl-2'

    result = diff_cv(current, baseline)
    change = result.changes[0]
    assert change.kind == REMOVED
    assert change.path == 'skills:skl-2'
