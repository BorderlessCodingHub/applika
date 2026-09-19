"""Unit tests for the diff Markdown document builder (KODI-017, T091).

Pins the deterministic skeleton the ticket spells out verbatim: the title
line, the "Compared with <label>: N changes" line, one ``## <Section> (n)``
per section with changes in the PINNED order, one bullet per change, and
"No changes." on an empty diff.
"""

import pytest

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
    CVDiffChange,
    CVDiffResult,
)
from app.application.services.cv_diff_markdown import render_diff_markdown


def _result(changes: list[CVDiffChange]) -> CVDiffResult:
    sections = dict.fromkeys(
        (
            'identity',
            'links',
            'summary',
            'experience',
            'languages',
            'skills',
            'projects',
            'education',
            'certifications',
        ),
        0,
    )
    for change in changes:
        sections[change.section] += 1
    return CVDiffResult(total=len(changes), sections=sections, changes=changes)


def test_zero_changes_prints_the_header_and_no_changes():
    document = render_diff_markdown('Backend CV', 'Master CV', _result([]))
    assert document.startswith('# Changes to Backend CV\n')
    assert 'Compared with Master CV: 0 changes' in document
    assert document.rstrip().endswith('No changes.')
    assert '##' not in document


def test_scalar_change_bullet_matches_the_pinned_wording():
    changes = [
        CVDiffChange(
            kind=CHANGED,
            section=IDENTITY_SECTION,
            path='headline',
            before='A',
            after='B',
        )
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert 'Compared with Master CV: 1 changes' in document
    assert '## Identity and contact (1)' in document
    assert '- Changed Headline: A -> B' in document


def test_added_experience_item_bullet_matches_the_pinned_wording():
    changes = [
        CVDiffChange(
            kind=ADDED,
            section=EXPERIENCE_SECTION,
            path='experience:exp-2',
            before=None,
            after={
                'id': 'exp-2',
                'company': 'Globex',
                'role': 'Senior Engineer',
            },
        )
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert '## Experience (1)' in document
    assert '- Added experience: Senior Engineer at Globex' in document


def test_removed_experience_item_bullet():
    changes = [
        CVDiffChange(
            kind=REMOVED,
            section=EXPERIENCE_SECTION,
            path='experience:exp-2',
            before={
                'id': 'exp-2',
                'company': 'Globex',
                'role': 'Senior Engineer',
            },
            after=None,
        )
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert '- Removed experience: Senior Engineer at Globex' in document


def test_keyword_added_and_removed_bullets():
    changes = [
        CVDiffChange(
            kind=KEYWORD_ADDED,
            section=SKILLS_SECTION,
            path='skills:skl-1.keywords:Go',
            before=None,
            after='Go',
        ),
        CVDiffChange(
            kind=KEYWORD_REMOVED,
            section=SKILLS_SECTION,
            path='skills:skl-1.keywords:SQL',
            before='SQL',
            after=None,
        ),
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert '## Skills (2)' in document
    assert '- Added keyword Go' in document
    assert '- Removed keyword SQL' in document


@pytest.mark.parametrize(
    ('section', 'item', 'expected_title'),
    [
        (
            LINKS_SECTION,
            {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'},
            'GitHub',
        ),
        (
            LINKS_SECTION,
            {'id': 'lnk-2', 'label': '', 'url': 'https://ada.example.com'},
            'https://ada.example.com',
        ),
        (
            SKILLS_SECTION,
            {'id': 'skl-1', 'category': 'Languages', 'keywords': []},
            'Languages',
        ),
        (
            PROJECTS_SECTION,
            {'id': 'prj-1', 'name': 'applika', 'description': '...'},
            'applika',
        ),
        (
            EDUCATION_SECTION,
            {
                'id': 'edu-1',
                'institution': 'Riverside Institute',
                'degree': "Master's degree",
            },
            "Master's degree at Riverside Institute",
        ),
        (
            CERTIFICATIONS_SECTION,
            {'id': 'crt-1', 'name': 'AWS SAA', 'issuer': 'Amazon'},
            'AWS SAA',
        ),
        (
            LANGUAGES_SECTION,
            {'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'},
            'Portuguese',
        ),
    ],
)
def test_item_title_covers_every_section(section, item, expected_title):
    added = CVDiffChange(
        kind=ADDED,
        section=section,
        path=f'{section}:{item["id"]}',
        before=None,
        after=item,
    )
    removed = CVDiffChange(
        kind=REMOVED,
        section=section,
        path=f'{section}:{item["id"]}',
        before=item,
        after=None,
    )
    added_document = render_diff_markdown(
        'Backend CV', 'Master CV', _result([added])
    )
    removed_document = render_diff_markdown(
        'Backend CV', 'Master CV', _result([removed])
    )
    assert expected_title in added_document
    assert expected_title in removed_document


def test_sections_appear_in_the_pinned_order():
    changes = [
        CVDiffChange(
            kind=CHANGED,
            section='certifications',
            path='certifications:crt-1.issuer',
            before='A',
            after='B',
        ),
        CVDiffChange(
            kind=CHANGED,
            section=IDENTITY_SECTION,
            path='headline',
            before='A',
            after='B',
        ),
        CVDiffChange(
            kind=CHANGED,
            section=EXPERIENCE_SECTION,
            path='experience:exp-1.role',
            before='A',
            after='B',
        ),
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    identity_index = document.index('## Identity and contact')
    experience_index = document.index('## Experience')
    certifications_index = document.index('## Certifications')
    assert identity_index < experience_index < certifications_index


def test_rendering_is_deterministic():
    changes = [
        CVDiffChange(
            kind=CHANGED,
            section=IDENTITY_SECTION,
            path='headline',
            before='A',
            after='B',
        )
    ]
    result = _result(changes)
    first = render_diff_markdown('Backend CV', 'Master CV', result)
    second = render_diff_markdown('Backend CV', 'Master CV', result)
    assert first == second


def _top_level_bullets(document: str) -> list[str]:
    return [line for line in document.splitlines() if line.startswith('- ')]


def test_bullets_render_joined_not_as_a_python_list():
    changes = [
        CVDiffChange(
            kind=CHANGED,
            section=EXPERIENCE_SECTION,
            path='experience:exp-1.bullets',
            before=['Cut p99 by half'],
            after=["It's done", 'Second bullet'],
        )
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert (
        "Changed experience Bullets: Cut p99 by half -> It's done; "
        'Second bullet'
    ) in document
    assert '[' not in document


def test_a_multi_line_value_stays_inside_its_one_bullet():
    """No spill-out, and no value can pose as a ``## `` section heading."""
    changes = [
        CVDiffChange(
            kind=CHANGED,
            section='summary',
            path='summary',
            before='First paragraph.\n\n## Injected heading\nMore.',
            after='New.\n\n- fake bullet',
        ),
        CVDiffChange(
            kind=CHANGED,
            section=IDENTITY_SECTION,
            path='headline',
            before='A',
            after='B',
        ),
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert len(_top_level_bullets(document)) == len(changes)
    headings = [
        line for line in document.splitlines() if line.startswith('## ')
    ]
    assert headings == ['## Identity and contact (1)', '## Summary (1)']
    assert (
        '- Changed Summary: First paragraph. ## Injected heading More. -> '
        'New. - fake bullet'
    ) in document


def test_a_keyword_containing_a_colon_is_kept_whole():
    changes = [
        CVDiffChange(
            kind=KEYWORD_ADDED,
            section=SKILLS_SECTION,
            path='skills:skl-1.keywords:ISO:27001',
            before=None,
            after='ISO:27001',
        ),
        CVDiffChange(
            kind=KEYWORD_REMOVED,
            section=SKILLS_SECTION,
            path='skills:skl-1.keywords:ISO:9001',
            before='ISO:9001',
            after=None,
        ),
    ]
    document = render_diff_markdown('Backend CV', 'Master CV', _result(changes))
    assert '- Added keyword ISO:27001' in document
    assert '- Removed keyword ISO:9001' in document


def test_changed_fields_and_keywords_name_their_item():
    current = TailoredCVContent.model_validate({
        'name': 'Backend CV',
        'full_name': 'Ada Example',
        'headline': 'Staff',
        'location': 'Lisbon',
        'email': 'ada@example.com',
        'experience': [
            {
                'id': 'exp-1',
                'company': 'Acme',
                'role': 'Principal Engineer',
                'start': '2024-02',
            }
        ],
        'skills': [
            {'id': 'skl-1', 'category': 'Languages', 'keywords': ['Go']}
        ],
    })
    changes = [
        CVDiffChange(
            kind=CHANGED,
            section=EXPERIENCE_SECTION,
            path='experience:exp-1.role',
            before='Staff Engineer',
            after='Principal Engineer',
        ),
        CVDiffChange(
            kind=KEYWORD_ADDED,
            section=SKILLS_SECTION,
            path='skills:skl-1.keywords:Go',
            before=None,
            after='Go',
        ),
        CVDiffChange(
            kind=KEYWORD_REMOVED,
            section=SKILLS_SECTION,
            path='skills:skl-1.keywords:SQL',
            before='SQL',
            after=None,
        ),
    ]
    document = render_diff_markdown(
        'Backend CV', 'Master CV', _result(changes), current
    )
    assert (
        '- Changed experience Role (Principal Engineer at Acme): '
        'Staff Engineer -> Principal Engineer'
    ) in document
    assert '- Added keyword Go to Languages' in document
    assert '- Removed keyword SQL from Languages' in document
