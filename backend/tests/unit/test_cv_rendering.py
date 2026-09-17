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

import difflib
import hashlib
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
    FONTS_DIR,
    RENDERCV_TYPST_PACKAGE_DIR,
    THEME_SOURCE_DIR,
    TYPST_PACKAGE_FILES,
    TYPST_PACKAGE_NAME,
    CVPdfRenderer,
    _bundled_typst_package_version,
    generate_typst_source,
    get_cv_pdf_renderer,
    pdf_filename,
    slugify,
    typst_package_path,
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
    for name in THEME_FILES:
        assert (THEME_SOURCE_DIR / name).is_file(), msg('a file', name)


# The four files the theme is made of, and the only files this test module is
# allowed to touch inside the reference folder - the rest of that folder is a
# real person's CV and is off limits. Never globbed, always named.
THEME_FILES = (
    'Header.j2.typ',
    'SectionBeginning.j2.typ',
    'SectionEnding.j2.typ',
    'entries/OneLineEntry.j2.typ',
)

# The owner's folder, two levels above the applika repo. Present on a
# workstation, absent in CI - it is deliberately not committed.
REFERENCE_THEME_DIR = (
    Path(__file__).resolve().parents[4] / 'custom-template-reference' / 'custom'
)

# The one edit the whole theme is allowed to carry: applika has no key
# achievements section (the ticket's non-goals), so that title drops out of
# the grid branch. Everything else is the owner's file byte for byte.
KEY_ACHIEVEMENTS_LINE = (
    '{% if snake_case_section_title in ["key_achievements", "languages"] %}'
)
APPLIKA_LINE = '{% if snake_case_section_title in ["languages"] %}'

# sha256 of each vendored file, so the rule above is enforced by the suite even
# where the owner's folder is not on disk. A future slice that edits a template
# breaks this test and has to come back to the owner for it.
THEME_DIGESTS = {
    'Header.j2.typ': 'fcf7094977ec44974bc298641c276b3857942c8dc80af5e38c3c3a647b08fd64',
    'SectionBeginning.j2.typ': '48d832f7b785cc039ae82194bd796eba0027830a15d223d74d7116358c57d466',
    'SectionEnding.j2.typ': '769e39565cecc5c2ef64528ab424f90b8e78a3e52d7a485af902d616414b5fd1',
    'entries/OneLineEntry.j2.typ': 'd5a41a25d228428fb2d9e2bb9e76b97ea9672cda9bce0801c79f3f7c9719fdec',
}


def _expected_template(name: str, reference_text: str) -> str:
    """What the vendored copy of ``name`` must contain, from the reference."""
    if name != 'SectionBeginning.j2.typ':
        return reference_text
    assert reference_text.count(KEY_ACHIEVEMENTS_LINE) == 1, msg(
        'the reference still has the key_achievements grid branch',
        reference_text.splitlines()[:1],
    )
    return reference_text.replace(KEY_ACHIEVEMENTS_LINE, APPLIKA_LINE)


@pytest.mark.skipif(
    not REFERENCE_THEME_DIR.is_dir(),
    reason="the owner's template folder is not committed; digests cover CI",
)
@pytest.mark.parametrize('name', THEME_FILES)
def test_vendored_theme_is_the_owners_template_verbatim(name: str):
    """The owner: "I won't accept any deviation of the original template."

    Three of the four files must be byte-identical to
    ``custom-template-reference/custom/``; ``SectionBeginning.j2.typ`` must be
    identical except for dropping ``key_achievements`` from the grid branch.
    The expectation is *computed* from the reference rather than written out
    here, so this test cannot drift away from the file it is guarding.

    Why it is worth a test of its own: the templates carry the layout
    contract the mapper is written against. A previous attempt at this slice
    added a branch to ``SectionBeginning.j2.typ`` to make certifications fit,
    and the owner rejected it. Nothing stopped that but a person reading the
    diff; this does.
    """
    reference = (REFERENCE_THEME_DIR / name).read_text(encoding='utf-8')
    vendored = (THEME_SOURCE_DIR / name).read_text(encoding='utf-8')
    assert vendored == _expected_template(name, reference), msg(
        f'{name} identical to the owner template',
        ''.join(
            difflib.unified_diff(
                _expected_template(name, reference).splitlines(keepends=True),
                vendored.splitlines(keepends=True),
                fromfile=f'owner/{name}',
                tofile=f'applika/{name}',
            )
        ),
    )


@pytest.mark.parametrize('name', THEME_FILES)
def test_vendored_theme_files_are_pinned_by_digest(name: str):
    """The same rule, enforced where the owner's folder is not on disk.

    The reference folder holds a real CV and is not committed, so the test
    above skips in CI. These digests do not: editing any vendored template
    fails here, which is the point - the owner foreclosed template changes,
    and a change that needs one has to be taken back to them.
    """
    digest = hashlib.sha256((THEME_SOURCE_DIR / name).read_bytes()).hexdigest()
    assert digest == THEME_DIGESTS[name], msg(THEME_DIGESTS[name], digest)


# --- The trimmed font payload --------------------------------------------------


def test_only_the_four_source_sans_3_faces_are_vendored():
    """The image ships this family and no other.

    ``rendercv[full]`` would install fifteen families (59 MB) for a theme that
    uses one. The list below is the *whole* directory, not a glob of one
    extension: a family re-added as ``.otf`` or ``.ttc`` would slip past a
    ``*.ttf`` check and back into the image.
    """
    shipped = {path.name for path in FONTS_DIR.iterdir() if path.is_file()}
    assert shipped == {
        'SourceSans3-Regular.ttf',
        'SourceSans3-Bold.ttf',
        'SourceSans3-Italic.ttf',
        'SourceSans3-BoldItalic.ttf',
        'OFL.txt',
    }, msg('the four Source Sans 3 faces and their licence', sorted(shipped))


def test_the_font_licence_travels_with_the_fonts():
    """OFL 1.1 requires the licence to ship with the font files."""
    licence = FONTS_DIR / 'OFL.txt'
    assert licence.is_file(), msg('an OFL.txt beside the fonts', licence)
    assert 'SIL Open Font License' in licence.read_text(encoding='utf-8')


def test_rendercv_fonts_is_never_imported():
    """The 59 MB package must not be reachable from the render path.

    Importing the renderer is the whole test: if any module it pulls in still
    reaches ``rendercv.renderer.pdf_png`` - the one module in RenderCV that
    imports ``rendercv_fonts`` - the name lands in ``sys.modules`` and the
    dependency is back in the image.
    """
    import sys

    import app.application.services.cv_rendering.renderer  # noqa: F401

    assert 'rendercv_fonts' not in sys.modules, msg(
        'no rendercv_fonts import', 'it was imported'
    )
    assert 'rendercv.renderer.pdf_png' not in sys.modules, msg(
        'no rendercv.renderer.pdf_png import', 'it was imported'
    )


def test_the_typst_package_is_laid_out_the_way_the_compiler_wants():
    """``@preview/rendercv:<version>`` resolves only under this exact shape."""
    version = _bundled_typst_package_version()
    package_directory = (
        typst_package_path() / 'preview' / TYPST_PACKAGE_NAME / version
    )
    assert package_directory.is_dir(), msg(
        'preview/rendercv/<version>/', package_directory
    )
    for name in TYPST_PACKAGE_FILES:
        assert (package_directory / name).is_file(), msg('a file', name)


def test_the_typst_package_version_is_read_from_the_installed_wheel():
    """Pinning it would break every render on a RenderCV upgrade."""
    manifest = (RENDERCV_TYPST_PACKAGE_DIR / 'typst.toml').read_text()
    version = _bundled_typst_package_version()
    assert f'version = "{version}"' in manifest, msg(version, manifest[:200])


def test_a_manifest_with_no_version_is_a_loud_failure(monkeypatch, tmp_path):
    """A silent wrong version would fail every render with an import error."""
    from app.application.services.cv_rendering import renderer as module

    (tmp_path / 'typst.toml').write_text('[package]\nname = "rendercv"\n')
    monkeypatch.setattr(module, 'RENDERCV_TYPST_PACKAGE_DIR', tmp_path)
    with pytest.raises(RuntimeError):
        _bundled_typst_package_version()


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


def test_certifications_map_to_text_entry_lines():
    """Bold name, then issuer - a TextEntry, not a OneLineEntry.

    The pair reads exactly as the owner's OneLineEntry template typesets one
    (semibold label, normal details), but as a markdown line that needs no
    surrounding ``#grid(``. See ``test_languages_is_the_only_one_line_entry``.
    """
    assert _sections()[CERTIFICATIONS_SECTION] == ['**AWS SAA** Amazon'], msg(
        'one markdown line', _sections()[CERTIFICATIONS_SECTION]
    )


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
    assert entries == ['**Site** [Site](https://ada.example.com)'], msg(
        'one Links line', entries
    )


def test_a_link_with_no_label_still_gets_a_line():
    """The URL stands in for the label rather than emitting ``**** ``."""
    entries = _sections(
        links=[{'id': 'l1', 'label': '', 'url': 'https://ada.example.com'}]
    )[LINKS_SECTION]
    assert entries == [
        '**https://ada.example.com** '
        '[https://ada.example.com](https://ada.example.com)'
    ], msg('a line built from the URL', entries)


def test_a_certification_with_no_issuer_is_just_the_bold_name():
    entries = _sections(
        certifications=[{'id': 'c1', 'name': 'AWS SAA', 'issuer': ''}]
    )[CERTIFICATIONS_SECTION]
    assert entries == ['**AWS SAA**'], msg('no trailing space', entries)


def test_languages_is_the_only_one_line_entry():
    """The owner's template can only close a grid it opened for languages.

    ``SectionBeginning.j2.typ`` opens ``#grid(`` for ``languages`` alone while
    ``SectionEnding.j2.typ`` emits the closing ``)`` for every OneLineEntry
    section, so a second dict-shaped section would print a stray bracket on
    the page. This asserts the mapper never creates one - the templates are
    the owner's and cannot be adjusted to accommodate it.
    """
    sections = _sections()
    dict_shaped = [
        title
        for title, entries in sections.items()
        if any(
            isinstance(entry, dict) and 'label' in entry for entry in entries
        )
    ]
    assert dict_shaped == [LANGUAGES_SECTION], msg(
        [LANGUAGES_SECTION], dict_shaped
    )


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


# --- The generated Typst is well-formed, section by section -------------------
#
# The trap this guards: Typst prints an unmatched ``[``, ``]``, ``,`` or ``)``
# as *text* instead of failing the compile. A render that returns a PDF whose
# bytes start with ``%PDF-`` therefore proves nothing about the markup - the
# stray brackets are simply printed on the page. Only reading the generated
# ``.typ`` catches it, which is why this asserts on the source and not on the
# PDF.


def _delimiter_balance(source: str) -> tuple[int, int, int, int]:
    """Scan Typst markup for ``()`` and ``[]`` balance.

    Returns ``(lowest_paren_depth, lowest_bracket_depth, final_paren_depth,
    final_bracket_depth)``. A depth that ever goes negative means a closer
    with no opener - exactly the shape a OneLineEntry emitted outside its grid
    produces. Quoted strings are skipped so a URL or a bullet glyph cannot
    throw the count off.
    """
    paren = bracket = lowest_paren = lowest_bracket = 0
    in_string = escaped = False
    for char in source:
        if escaped:
            escaped = False
        elif char == '\\':
            escaped = True
        elif in_string:
            in_string = char != '"'
        elif char == '"':
            in_string = True
        elif char == '(':
            paren += 1
        elif char == ')':
            paren -= 1
            lowest_paren = min(lowest_paren, paren)
        elif char == '[':
            bracket += 1
        elif char == ']':
            bracket -= 1
            lowest_bracket = min(lowest_bracket, bracket)
    return lowest_paren, lowest_bracket, paren, bracket


def test_a_cv_with_languages_certifications_and_links_is_well_formed(tmp_path):
    """The three pair-shaped sections together, through the real theme.

    All three exist on this CV, and all three used to be OneLineEntry: only
    ``Languages`` opens the grid the owner's ``SectionEnding.j2.typ`` closes,
    so ``Certifications`` and ``Links`` printed a literal ``[``, ``],`` and
    ``)`` around every entry. Reverting the mapper to OneLineEntry for either
    of them drives the paren depth negative here and fails this test.
    """
    yaml_text = map_cv_to_rendercv_yaml(_cv())
    source = generate_typst_source(yaml_text, tmp_path).read_text(
        encoding='utf-8'
    )

    for section in (LANGUAGES_SECTION, CERTIFICATIONS_SECTION, LINKS_SECTION):
        assert f'== {section}' in source, msg(f'a {section} heading', section)

    lowest_paren, lowest_bracket, paren, bracket = _delimiter_balance(source)
    assert (lowest_paren, lowest_bracket, paren, bracket) == (0, 0, 0, 0), msg(
        'balanced Typst delimiters',
        {
            'lowest_paren_depth': lowest_paren,
            'lowest_bracket_depth': lowest_bracket,
            'final_paren_depth': paren,
            'final_bracket_depth': bracket,
        },
    )


def test_only_the_languages_section_carries_a_grid(tmp_path):
    """The grid the owner's templates open and close, and nothing else.

    Balance alone would also be satisfied by a section that opened its own
    grid, which is the deviation the owner rejected. This pins the count: one
    ``#grid(`` in the whole document, in ``Languages``.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')

    grids = source.count('#grid(')
    assert grids == 1, msg('exactly one grid', grids)

    after_languages = source.split(f'== {LANGUAGES_SECTION}', 1)[1]
    next_heading = after_languages.find('\n== ')
    languages_block = after_languages[
        : next_heading if next_heading != -1 else None
    ]
    assert '#grid(' in languages_block, msg(
        'the grid belongs to Languages', languages_block[:200]
    )


def test_certifications_and_links_typeset_as_bold_label_then_details(
    tmp_path,
):
    """The replacement reads like the entry it replaced.

    A OneLineEntry typesets a semibold label followed by normal details. The
    TextEntry line has to land on the same thing - bold name, then issuer;
    bold label, then the hyperlink - or the fix traded broken markup for a
    different-looking CV.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')

    assert '#strong[AWS SAA] Amazon' in source, msg(
        'a bold certification name followed by its issuer',
        source[source.find(f'== {CERTIFICATIONS_SECTION}') :][:200],
    )
    assert '#strong[Site] #link("https://ada.example.com")[Site]' in source, (
        msg(
            'a bold link label followed by the hyperlink',
            source[source.find(f'== {LINKS_SECTION}') :][:200],
        )
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
