"""Unit tests for the CV PDF rendering service.

Three things get pinned here, none of which need a database or a real compile.

**The mapper is a contract, not a convenience.** It decides what is typeset and
what is dropped, so each of the seven stored sections gets its field mapping
asserted, and each gets an "empty means the heading does not exist" assertion -
RenderCV would gladly print a *Projects* title over nothing.

**The theme is fixed and has the owner's tokens.** ``ApplikaTheme`` is what
turns the vendored templates into the one look the product ships; if a default
drifts back to RenderCV's ``classic`` value the PDF changes silently, so the
tokens are asserted directly rather than through a render.

**A render that cannot finish fails loudly and leaves nothing behind.** The
timeout path and the failure path both have to end in ``PdfRenderFailed`` and
both have to remove the temporary directory - a renderer that leaks a directory
per failed request fills the disk of a long-running container.

All CV data here is invented.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from app.application.dto.base_cv import BaseCVDTO
from app.application.services.cv_rendering import renderer as renderer_module
from app.application.services.cv_rendering.mapper import (
    CERTIFICATIONS_SECTION,
    EXPERIENCE_SECTION,
    LANGUAGES_SECTION,
    LINKS_SECTION,
    PROJECTS_SECTION,
    SKILLS_SECTION,
    SUMMARY_SECTION,
    THEME_NAME,
    map_cv_to_rendercv_document,
    map_cv_to_rendercv_yaml,
)
from app.application.services.cv_rendering.renderer import (
    THEME_SOURCE_DIR,
    CVPdfRenderer,
    get_cv_pdf_renderer,
    pdf_filename,
    slugify,
)
from app.application.services.cv_rendering.themes.applika import ApplikaTheme
from app.core.exceptions import PdfRenderFailed
from tests import msg

FULL_SECTIONS: dict[str, Any] = {
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'},
        {'id': 'lnk-2', 'label': 'Site', 'url': 'https://ada.example.com'},
    ],
    'skills': ['Python', 'PostgreSQL', 'FastAPI'],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'company_description': 'Anvils, mostly',
            'role': 'Staff Engineer',
            'period': '2020 - 2026',
            'location': 'Lisbon, PT',
            'bullets': ['Cut p99 by half', 'Owned the billing rewrite'],
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
    'certifications': [{'id': 'crt-1', 'name': 'AWS SAA', 'issuer': 'Amazon'}],
    'languages': [
        {'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'},
        {'id': 'lng-2', 'name': 'English', 'level': 'C2'},
    ],
}

EMPTY_SECTIONS: dict[str, Any] = {
    'links': [],
    'skills': [],
    'experience': [],
    'projects': [],
    'certifications': [],
    'languages': [],
}


def _cv(**overrides: Any) -> BaseCVDTO:
    """A stored master CV. Every value is invented."""
    body: dict[str, Any] = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'user_id': 1,
        'name': 'Backend CV',
        'full_name': 'Ada Example',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+1 202 555 0147',
        'summary': 'Ten years of backend engineering.',
        **FULL_SECTIONS,
    }
    body.update(overrides)
    return BaseCVDTO(**body)


def _sections(**overrides: Any) -> dict[str, Any]:
    document = map_cv_to_rendercv_document(_cv(**overrides))
    return document['cv'].get('sections', {})


# --- The theme is fixed, and it is the owner's --------------------------------


def test_theme_is_applika_and_not_a_parameter():
    """The discriminator RenderCV keys off is the one name we ship."""
    theme = ApplikaTheme()
    assert theme.theme == THEME_NAME, msg(THEME_NAME, theme.theme)
    assert ApplikaTheme.__name__ == 'ApplikaTheme', msg(
        'ApplikaTheme', ApplikaTheme.__name__
    )


def test_theme_page_is_a4_with_the_owners_margins():
    page = ApplikaTheme().page
    assert page.size == 'a4', msg('a4', page.size)
    assert page.top_margin == '0.55in', msg('0.55in', page.top_margin)
    assert page.bottom_margin == '0.55in', msg('0.55in', page.bottom_margin)
    assert page.left_margin == '0.6in', msg('0.6in', page.left_margin)
    assert page.right_margin == '0.6in', msg('0.6in', page.right_margin)
    assert page.show_footer is False, msg(False, page.show_footer)
    assert page.show_top_note is False, msg(False, page.show_top_note)


def test_theme_typography_is_source_sans_3():
    """The font the PDF must embed, per family, not just for the body."""
    typography = ApplikaTheme().typography
    families = typography.font_family
    for element in (
        'body',
        'name',
        'headline',
        'connections',
        'section_titles',
    ):
        family = getattr(families, element)
        assert family == 'Source Sans 3', msg('Source Sans 3', family)
    assert typography.font_size.body == '10pt'
    assert typography.font_size.name == '26pt'
    assert typography.font_size.headline == '11pt'
    assert typography.font_size.connections == '9pt'
    assert typography.font_size.section_titles == '1.2em'
    assert typography.line_spacing == '0.65em'
    assert typography.alignment == 'justified-with-no-hyphenation'
    assert typography.bold.name is True
    assert typography.bold.section_titles is True


def test_theme_colors_are_the_owners_tokens():
    colors = ApplikaTheme().colors
    assert str(colors.body) == 'rgb(25, 25, 25)'
    assert str(colors.name) == 'rgb(10, 10, 10)'
    assert str(colors.headline) == 'rgb(55, 55, 55)'
    assert str(colors.connections) == 'rgb(65, 65, 65)'
    assert str(colors.section_titles) == 'rgb(10, 10, 10)'
    assert str(colors.links) == 'rgb(25, 95, 175)'


def test_theme_header_has_no_icons():
    """Icons default to on, and switching them on drags FontAwesome in."""
    header = ApplikaTheme().header
    assert header.alignment == 'center', msg('center', header.alignment)
    assert header.connections.show_icons is False
    assert header.connections.hyperlink is True
    assert header.connections.separator == '•'


def test_theme_section_titles_and_bullets():
    theme = ApplikaTheme()
    assert theme.section_titles.type == 'centered_with_partial_line'
    assert theme.section_titles.line_thickness == '0.1pt'
    assert theme.entries.highlights.bullet == '•'


def test_theme_dates_are_numeric():
    templates = ApplikaTheme().templates
    assert templates.single_date == 'MONTH_IN_TWO_DIGITS/YEAR'
    assert templates.date_range == 'START_DATE - END_DATE'


def test_vendored_theme_files_ship_with_the_code():
    """RenderCV needs at least one ``.j2.typ`` beside the theme module."""
    for name in (
        'Header.j2.typ',
        'SectionBeginning.j2.typ',
        'SectionEnding.j2.typ',
        'entries/OneLineEntry.j2.typ',
    ):
        assert (THEME_SOURCE_DIR / name).is_file(), msg('a file', name)


def test_one_line_entry_sections_open_a_grid_the_ending_can_close():
    """The one branch in the vendored templates that is ours, pinned.

    ``SectionEnding.j2.typ`` - byte-identical to the owner's - emits a closing
    ``)`` for *every* OneLineEntry section, while only ``languages`` opens the
    three-column grid. Certifications are OneLineEntry too, so without a
    matching opener their section prints a stray ``),`` on the page. Typst does
    not complain about it (a lone ``)`` is just text), so no render test can
    catch this: only asserting the template itself protects the fix.
    """
    beginning = (THEME_SOURCE_DIR / 'SectionBeginning.j2.typ').read_text()
    ending = (THEME_SOURCE_DIR / 'SectionEnding.j2.typ').read_text()

    assert 'OneLineEntry' in ending, msg(
        'the ending still closes OneLineEntry sections', ending
    )
    assert 'entry_type in ["OneLineEntry"]' in beginning, msg(
        'an opener for non-languages OneLineEntry sections', beginning
    )
    assert 'columns: (1fr)' in beginning, msg(
        'a one-column grid for them', beginning
    )
    assert 'columns: (1fr, 1fr, 1fr)' in beginning, msg(
        'languages keeps the three-column grid', beginning
    )


def test_vendored_section_beginning_has_no_key_achievements_branch():
    """The owner's template had a second grid section; applika has one."""
    template = (THEME_SOURCE_DIR / 'SectionBeginning.j2.typ').read_text()
    assert 'key_achievements' not in template, msg(
        'no key_achievements branch', template
    )
    assert 'languages' in template, msg('a languages branch', template)


# --- The mapper: the theme is never the caller's choice ------------------------


def test_design_is_always_the_applika_theme():
    document = map_cv_to_rendercv_document(_cv())
    assert document['design'] == {'theme': THEME_NAME}, msg(
        {'theme': THEME_NAME}, document['design']
    )


def test_yaml_round_trips_the_document():
    yaml_text = map_cv_to_rendercv_yaml(_cv())
    assert f'theme: {THEME_NAME}' in yaml_text, msg(THEME_NAME, yaml_text)
    assert 'Ada Example' in yaml_text, msg('the person', yaml_text)


# --- The mapper: field mapping, section by section -----------------------------


def test_person_name_comes_from_full_name_not_the_cv_label():
    """``name`` is what the user called the CV; ``full_name`` is the person."""
    cv_block = map_cv_to_rendercv_document(
        _cv(name='Backend CV', full_name='Ada Example')
    )['cv']
    assert cv_block['name'] == 'Ada Example', msg(
        'Ada Example', cv_block['name']
    )
    assert cv_block['headline'] == 'Staff Backend Engineer'
    assert cv_block['location'] == 'Lisbon, PT'


def test_summary_maps_to_a_text_entry():
    sections = _sections()
    assert sections[SUMMARY_SECTION] == ['Ten years of backend engineering.']


def test_experience_maps_to_an_experience_entry():
    entry = _sections()[EXPERIENCE_SECTION][0]
    assert entry == {
        'company': 'Acme',
        'position': 'Staff Engineer',
        'date': '2020 - 2026',
        'location': 'Lisbon, PT',
        'summary': 'Anvils, mostly',
        'highlights': ['Cut p99 by half', 'Owned the billing rewrite'],
    }, msg('the mapped experience entry', entry)


def test_projects_map_to_a_normal_entry_carrying_the_link():
    entry = _sections()[PROJECTS_SECTION][0]
    assert entry['name'] == 'applika', msg('applika', entry['name'])
    assert entry['summary'] == (
        'Job application tracker '
        '[applika.example.com](https://applika.example.com)'
    ), msg('description plus markdown link', entry['summary'])


def test_skills_map_to_a_single_line():
    assert _sections()[SKILLS_SECTION] == ['Python • PostgreSQL • FastAPI'], (
        msg('one joined line', _sections()[SKILLS_SECTION])
    )


def test_certifications_map_to_one_line_entries():
    assert _sections()[CERTIFICATIONS_SECTION] == [
        {'label': 'AWS SAA', 'details': 'Amazon'}
    ]


def test_languages_map_to_one_line_entries():
    assert _sections()[LANGUAGES_SECTION] == [
        {'label': 'Portuguese', 'details': 'Native'},
        {'label': 'English', 'details': 'C2'},
    ]


def test_known_link_becomes_a_social_network():
    cv_block = map_cv_to_rendercv_document(_cv())['cv']
    assert {'network': 'GitHub', 'username': 'ada'} in cv_block[
        'social_networks'
    ], msg('a GitHub connection', cv_block.get('social_networks'))


def test_unknown_link_falls_back_to_a_links_entry():
    """RenderCV knows a closed list of networks; the rest still get typeset."""
    entries = _sections()[LINKS_SECTION]
    assert entries == [
        {
            'label': 'Site',
            'details': '[Site](https://ada.example.com)',
        }
    ], msg('one Links entry', entries)


def test_no_links_section_when_every_link_is_a_social_network():
    sections = _sections(
        links=[{'id': 'l1', 'label': 'GitHub', 'url': 'https://github.com/ada'}]
    )
    assert LINKS_SECTION not in sections, msg('no Links section', sections)


# --- The mapper: an empty section is omitted, never emitted blank -------------


@pytest.mark.parametrize(
    ('field', 'section'),
    [
        ('summary', SUMMARY_SECTION),
        ('experience', EXPERIENCE_SECTION),
        ('projects', PROJECTS_SECTION),
        ('skills', SKILLS_SECTION),
        ('certifications', CERTIFICATIONS_SECTION),
        ('languages', LANGUAGES_SECTION),
        ('links', LINKS_SECTION),
    ],
)
def test_empty_section_is_omitted(field: str, section: str):
    empty: Any = '' if field == 'summary' else []
    assert section not in _sections(**{field: empty}), msg(
        f'no {section} heading', section
    )


def test_a_cv_with_nothing_but_identity_has_no_sections():
    cv_block = map_cv_to_rendercv_document(_cv(summary='', **EMPTY_SECTIONS))[
        'cv'
    ]
    assert 'sections' not in cv_block, msg('no sections key', cv_block)
    assert cv_block['name'] == 'Ada Example'


def test_blank_strings_do_not_become_entries():
    """Whitespace-only stored values are not content."""
    sections = _sections(
        summary='   ',
        skills=['  ', ''],
        certifications=[{'id': 'c1', 'name': '  ', 'issuer': ' '}],
    )
    assert SUMMARY_SECTION not in sections
    assert SKILLS_SECTION not in sections
    assert CERTIFICATIONS_SECTION not in sections


# --- The mapper: stored data never sinks the render --------------------------


def test_invalid_email_is_dropped_not_fatal():
    """applika stores free text; RenderCV would refuse a reserved domain."""
    cv_block = map_cv_to_rendercv_document(_cv(email='ada@example.test'))['cv']
    assert 'email' not in cv_block, msg('no email key', cv_block)
    assert cv_block['name'] == 'Ada Example', msg(
        'the rest of the CV survives', cv_block
    )


def test_invalid_phone_is_dropped_not_fatal():
    cv_block = map_cv_to_rendercv_document(_cv(phone='call me'))['cv']
    assert 'phone' not in cv_block, msg('no phone key', cv_block)
    assert cv_block['name'] == 'Ada Example'


def test_valid_contacts_are_kept():
    cv_block = map_cv_to_rendercv_document(_cv())['cv']
    assert cv_block['email'] == 'ada@example.com'
    assert cv_block['phone'] == '+1 202 555 0147'


def test_hash_word_is_neutralized_everywhere_it_is_typeset():
    """``#word`` is a Typst command to RenderCV and aborts the compile."""
    sections = _sections(
        summary='Open to work: #opentowork',
        skills=['#DevOps'],
    )
    summary = sections[SUMMARY_SECTION][0]
    assert '#opentowork' not in summary, msg('neutralized hash', summary)
    assert 'sym.hash' in summary, msg('a hash symbol command', summary)
    assert 'opentowork' in summary, msg('the word survives', summary)
    assert 'sym.hash' in sections[SKILLS_SECTION][0]


def test_hash_not_followed_by_a_letter_is_left_alone():
    """``C#`` and ``#1`` are escaped by RenderCV itself; do not touch them."""
    summary = _sections(summary='C# dev, #1 by volume')[SUMMARY_SECTION][0]
    assert summary == 'C# dev, #1 by volume', msg('untouched', summary)


def test_link_url_is_never_rewritten():
    """The URL is a link target, not typeset text."""
    entry = _sections(
        projects=[
            {
                'id': 'p1',
                'name': 'applika',
                'description': 'Tracker',
                'link': 'https://example.com/a#section',
                'link_label': 'docs',
            }
        ]
    )[PROJECTS_SECTION][0]
    assert '(https://example.com/a#section)' in entry['summary'], msg(
        'the URL verbatim', entry['summary']
    )


# --- The download filename ----------------------------------------------------


@pytest.mark.parametrize(
    ('label', 'expected'),
    [
        ('Backend CV', 'backend-cv'),
        ('  Senior   Backend  ', 'senior-backend'),
        ('CV #1 (2026)', 'cv-1-2026'),
        ('---', 'cv'),
        ('', 'cv'),
        ('Currículo Técnico', 'curr-culo-t-cnico'),
    ],
)
def test_slugify(label: str, expected: str):
    assert slugify(label) == expected, msg(expected, slugify(label))


def test_pdf_filename_appends_the_extension():
    assert pdf_filename('Backend CV') == 'backend-cv.pdf'


# --- The renderer: failures are loud and leave nothing behind -----------------


class _TempDirSpy:
    """Records the directory the renderer made so a test can outlive it."""

    def __init__(self):
        self.path: Path | None = None

    def __call__(self, *args: Any, **kwargs: Any) -> str:
        created = self._real(*args, **kwargs)
        self.path = Path(created)
        return created

    _real: Any = staticmethod(renderer_module.tempfile.mkdtemp)


async def test_render_failure_raises_pdf_render_failed(monkeypatch):
    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('typst said no')

    monkeypatch.setattr(renderer_module, '_render_sync', _boom)
    with pytest.raises(PdfRenderFailed):
        await CVPdfRenderer().render(_cv())


async def test_render_failure_removes_the_temp_directory(monkeypatch):
    spy = _TempDirSpy()
    monkeypatch.setattr(renderer_module.tempfile, 'mkdtemp', spy)

    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('typst said no')

    monkeypatch.setattr(renderer_module, '_render_sync', _boom)
    with pytest.raises(PdfRenderFailed):
        await CVPdfRenderer().render(_cv())

    assert spy.path is not None, msg('a temp dir was made', spy.path)
    assert not spy.path.exists(), msg('the temp dir is gone', spy.path)


async def test_render_timeout_raises_pdf_render_failed(monkeypatch):
    """A compile that outlives the budget is a failure, not a long wait."""
    import time

    def _slow(*args: Any, **kwargs: Any):
        time.sleep(0.5)
        return b'%PDF-never'

    monkeypatch.setattr(renderer_module, '_render_sync', _slow)
    with pytest.raises(PdfRenderFailed):
        await CVPdfRenderer(timeout_seconds=0).render(_cv())


async def test_render_timeout_removes_the_temp_directory(monkeypatch):
    import time

    spy = _TempDirSpy()
    monkeypatch.setattr(renderer_module.tempfile, 'mkdtemp', spy)

    def _slow(*args: Any, **kwargs: Any):
        time.sleep(0.5)
        return b'%PDF-never'

    monkeypatch.setattr(renderer_module, '_render_sync', _slow)
    with pytest.raises(PdfRenderFailed):
        await CVPdfRenderer(timeout_seconds=0).render(_cv())

    assert spy.path is not None
    assert not spy.path.exists(), msg('the temp dir is gone', spy.path)


async def test_render_failure_message_never_quotes_the_cv(monkeypatch):
    """RenderCV's own errors quote the offending value; ours must not."""

    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('invalid value: Ada Example')

    monkeypatch.setattr(renderer_module, '_render_sync', _boom)
    with pytest.raises(PdfRenderFailed) as exc_info:
        await CVPdfRenderer().render(_cv())
    assert 'Ada Example' not in exc_info.value.message, msg(
        'no CV content in the error', exc_info.value.message
    )


async def test_renderer_names_the_file_after_the_cv_label(monkeypatch):
    monkeypatch.setattr(
        renderer_module, '_render_sync', lambda *a, **k: b'%PDF-fake'
    )
    rendered = await CVPdfRenderer().render(_cv(name='My Backend CV'))
    assert rendered.filename == 'my-backend-cv.pdf', msg(
        'my-backend-cv.pdf', rendered.filename
    )
    assert rendered.content == b'%PDF-fake'


def test_default_timeout_comes_from_settings():
    from app.config.settings import envs

    assert (
        get_cv_pdf_renderer().timeout_seconds
        == envs.CV_PDF_RENDER_TIMEOUT_SECONDS
    )
