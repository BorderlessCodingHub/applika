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
import ruamel.yaml

from app.application.dto.base_cv import (
    BaseCVDTO,
    EducationItem,
    ExperienceItem,
)
from app.application.services.cv_rendering import renderer as renderer_module
from app.application.services.cv_rendering.mapper import (
    CERTIFICATIONS_SECTION,
    EDUCATION_SECTION,
    EXPERIENCE_SECTION,
    LANGUAGES_SECTION,
    LINK_CONNECTION_ICON,
    PROJECTS_SECTION,
    SECTION_ORDER,
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
    'skills': [
        {
            'id': 'skl-1',
            'category': 'Languages & Frameworks',
            'keywords': ['Python', 'PostgreSQL', 'FastAPI'],
        },
        {
            'id': 'skl-2',
            'category': 'Platform & Delivery:',
            'keywords': ['Docker', 'Terraform'],
        },
        {'id': 'skl-3', 'category': 'Practices', 'keywords': []},
    ],
    'experience': [
        # The current role: a `start` and no `end` at all, which is how the
        # owner asked a running entry to be stored ("finish is optional, when
        # empty is counted as Present") and what makes the page say `present`.
        {
            'id': 'exp-1',
            'company': 'Acme',
            'company_description': 'Anvils, mostly',
            'role': 'Staff Engineer',
            'start': '2024-02',
            'location': 'Lisbon, PT',
            'bullets': ['Cut p99 by half', 'Owned the billing rewrite'],
        },
        # A finished role: both months, which the page prints as a range.
        {
            'id': 'exp-2',
            'company': 'Globex',
            'role': 'Senior Engineer',
            'start': '2023-02',
            'end': '2024-02',
        },
    ],
    'projects': [
        {
            'id': 'prj-1',
            'name': 'applika',
            'description': 'Job application tracker',
            'link': 'https://applika.example.com',
            'link_label': 'applika.example.com',
        },
        {
            'id': 'prj-2',
            'name': 'slowquery',
            'description': 'Samples slow query plans',
            'link': 'https://example.org/slowquery',
            'link_label': None,
        },
    ],
    'education': [
        {
            'id': 'edu-1',
            'institution': 'Riverside Institute',
            'degree': "Master's degree",
            'area': 'Distributed Systems',
            'start': '2016-09',
            'end': '2018-07',
        },
        {
            'id': 'edu-2',
            'institution': 'Northgate College',
            'degree': "Bachelor's degree",
            'area': 'Computer Science',
            'start': '2012-09',
            'end': '2016-07',
        },
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
    'education': [],
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


def _sections_unvalidated(**overrides: Any) -> dict[str, Any]:
    """Map a CV whose section items bypassed validation.

    The mapper's defensive branches - a blank ``start``, an item with nothing
    in it at all - cannot be reached through a validated payload any more, so
    the items are built with ``model_construct`` and dropped onto the document
    with ``model_copy(update=...)``, which pydantic also leaves unvalidated.
    """
    return map_cv_to_rendercv_document(_cv().model_copy(update=overrides))[
        'cv'
    ].get('sections', {})


# The owner's folder, two levels above the applika repo. Present on a
# workstation, absent in CI - it is deliberately not committed.
REFERENCE_THEME_DIR = (
    Path(__file__).resolve().parents[4] / 'custom-template-reference' / 'custom'
)

# --- The theme is fixed, and it is the owner's, token for token ---------------
#
# What this block exists to stop, in the owner's words: "My opnion if that you
# forgot completelly what i said during plan and deviate in 40%." The first cut
# of ``ApplikaTheme`` set roughly half of his ``design`` block, and the tests
# guarding it were spot checks - a handful of values per sub-model, chosen by
# the same hand that wrote the code. A spot check cannot notice a token nobody
# thought about, and every one of the missing tokens was a *spacing* token, so
# the PDF compiled cleanly and looked wrong.
#
# So the pin below is exhaustive rather than representative: one parametrized
# case per token of the owner's block, keyed by its dotted path, and a second
# test that reads his file when it is on disk and refuses to pass unless the
# table below covers it key for key. Adding a token to his block and not to
# this table fails; dropping one from ``ApplikaTheme`` fails with the path that
# moved.

# Every token of the owner's ``design`` block, flattened to ``dotted.path`` ->
# value as ``ApplikaTheme().model_dump(mode='json')`` renders it. A token is
# listed even when it happens to equal RenderCV's own ``ClassicTheme``
# default - the point is to reproduce *his file*, not the delta against
# RenderCV, and a RenderCV release that moves a default must fail here rather
# than move the product's look in silence.
#
# ``theme`` itself is excluded on purpose: his says ``custom``, ours says
# ``applika``, and that rename is the one intended difference.
#
# ``font_family`` is written as five expanded paths because the owner gives it
# as a bare string and RenderCV's own validator fans it out to the five
# elements; ``_flatten_owner_design`` does the same fan-out when it reads his
# file, so the two sides stay comparable.
OWNER_DESIGN_TOKENS: dict[str, Any] = {
    'page.size': 'a4',
    'page.top_margin': '0.55in',
    'page.bottom_margin': '0.55in',
    'page.left_margin': '0.6in',
    'page.right_margin': '0.6in',
    'page.show_footer': False,
    'page.show_top_note': False,
    'typography.line_spacing': '0.65em',
    'typography.alignment': 'justified-with-no-hyphenation',
    'typography.font_family.body': 'Source Sans 3',
    'typography.font_family.name': 'Source Sans 3',
    'typography.font_family.headline': 'Source Sans 3',
    'typography.font_family.connections': 'Source Sans 3',
    'typography.font_family.section_titles': 'Source Sans 3',
    'typography.font_size.body': '10pt',
    'typography.font_size.name': '26pt',
    'typography.font_size.headline': '11pt',
    'typography.font_size.connections': '9pt',
    'typography.font_size.section_titles': '1.2em',
    'typography.small_caps.name': False,
    'typography.small_caps.headline': False,
    'typography.small_caps.connections': False,
    'typography.small_caps.section_titles': False,
    'typography.bold.name': True,
    'typography.bold.headline': False,
    'typography.bold.connections': False,
    'typography.bold.section_titles': True,
    'colors.body': 'rgb(25, 25, 25)',
    'colors.name': 'rgb(10, 10, 10)',
    'colors.headline': 'rgb(55, 55, 55)',
    'colors.connections': 'rgb(65, 65, 65)',
    'colors.section_titles': 'rgb(10, 10, 10)',
    'colors.links': 'rgb(25, 95, 175)',
    'colors.footer': 'rgb(150, 150, 150)',
    'colors.top_note': 'rgb(150, 150, 150)',
    'header.alignment': 'center',
    # The owner's "HUGE PROBLEM": three tokens, all missing from the first cut.
    'header.space_below_name': '0.3cm',
    'header.space_below_headline': '0.3cm',
    'header.space_below_connections': '0.6cm',
    'header.connections.separator': '•',
    'header.connections.show_icons': False,
    'header.connections.hyperlink': True,
    'header.connections.display_urls_instead_of_usernames': False,
    'header.connections.space_between_connections': '0.4cm',
    'links.underline': False,
    'links.show_external_link_icon': False,
    'section_titles.type': 'centered_with_partial_line',
    'section_titles.line_thickness': '0.1pt',
    'section_titles.space_above': '0.5cm',
    'section_titles.space_below': '0.5cm',
    'sections.allow_page_break': True,
    'sections.space_between_regular_entries': '0.95em',
    'sections.space_between_text_based_entries': '0.2em',
    # Empty, not ``['experience']``: RenderCV's default appends "2 years 3
    # months" to every experience date range and the owner's CV has no such
    # thing.
    'sections.show_time_spans_in': [],
    'entries.short_second_row': False,
    'entries.side_space': '0.1cm',
    'entries.space_between_columns': '0.15cm',
    'entries.date_and_location_width': '4.1cm',
    'entries.allow_page_break': False,
    'entries.summary.space_above': '0.04cm',
    'entries.summary.space_left': '0cm',
    'entries.highlights.bullet': '•',
    'entries.highlights.nested_bullet': '◦',
    'entries.highlights.space_left': '0.15cm',
    'entries.highlights.space_above': '0.04cm',
    'entries.highlights.space_between_items': '0.03cm',
    'entries.highlights.space_between_bullet_and_text': '0.5em',
    # The education layout arrives entirely through these three: institution,
    # then the degree phrase, then the date alone on the right. It is why the
    # education section needs no vendored ``.j2.typ`` of its own.
    'templates.education_entry.main_column': (
        'INSTITUTION\nDEGREE_WITH_AREA\nSUMMARY\nHIGHLIGHTS'
    ),
    'templates.education_entry.date_and_location_column': 'DATE',
    'templates.education_entry.degree_column': None,
    'templates.single_date': 'MONTH_IN_TWO_DIGITS/YEAR',
    'templates.date_range': 'START_DATE - END_DATE',
}


def _dotted(document: dict[str, Any], path: str) -> Any:
    """Walk ``document`` by a dotted path, failing loudly on a missing key."""
    current: Any = document
    for key in path.split('.'):
        assert isinstance(current, dict) and key in current, msg(
            f'a value at {path}', current
        )
        current = current[key]
    return current


def test_theme_is_applika_and_not_a_parameter():
    """The discriminator RenderCV keys off is the one name we ship."""
    theme = ApplikaTheme()
    assert theme.theme == THEME_NAME, msg(THEME_NAME, theme.theme)
    assert ApplikaTheme.__name__ == 'ApplikaTheme', msg(
        'ApplikaTheme', ApplikaTheme.__name__
    )


@pytest.mark.parametrize('path', sorted(OWNER_DESIGN_TOKENS))
def test_theme_carries_every_token_of_the_owners_design_block(path: str):
    """One case per token of the owner's ``design`` block, by dotted path.

    Parametrized rather than grouped into a handful of asserts so a regression
    names the token that moved instead of the sub-model it lives in, and so a
    token can never be quietly deleted from a passing test body.
    """
    expected = OWNER_DESIGN_TOKENS[path]
    # ``warnings='none'``: ``Typography.font_family`` is declared as
    # ``FontFamily | str`` and RenderCV's own validator always turns it into
    # the ``FontFamily``, which the serializer flags as "unexpected" for the
    # ``str`` arm of the union. The value is right; only the notice is noise.
    document = ApplikaTheme().model_dump(mode='json', warnings='none')
    actual = _dotted(document, path)
    assert actual == expected, msg(expected, actual)


# The owner's input file, beside the theme folder the templates come from. It
# is *globbed* rather than named - the opposite of ``THEME_FILES`` and for the
# same reason those are named: the filename is a real person's name, and it has
# no business written into this repository.
REFERENCE_PROJECT_DIR = REFERENCE_THEME_DIR.parent
_DESIGN_KEY = 'design:'

_FONT_FAMILY_ELEMENTS = (
    'body',
    'name',
    'headline',
    'connections',
    'section_titles',
)


def _owner_design_block() -> dict[str, Any]:
    """Parse *only* the ``design:`` block of the owner's input file.

    Everything above ``design:`` is a real CV and is not read, let alone
    asserted on: the slice of text handed to the parser starts at the
    ``design:`` line, which is the last top-level key in the file.
    """
    candidates = sorted(REFERENCE_PROJECT_DIR.glob('*.yaml'))
    assert len(candidates) == 1, msg('one reference input file', candidates)
    text = candidates[0].read_text(encoding='utf-8')
    start = text.index(f'\n{_DESIGN_KEY}') + 1
    parsed = ruamel.yaml.YAML(typ='safe', pure=True).load(text[start:])
    return dict(parsed['design'])


def _flatten_owner_design(block: Any, prefix: str = '') -> dict[str, Any]:
    """Flatten the owner's block to the same dotted paths the table uses."""
    if prefix == 'typography.font_family' and isinstance(block, str):
        return {
            f'{prefix}.{element}': block for element in _FONT_FAMILY_ELEMENTS
        }
    if not isinstance(block, dict):
        return {prefix: block}
    flattened: dict[str, Any] = {}
    for key, value in block.items():
        child = f'{prefix}.{key}' if prefix else str(key)
        flattened.update(_flatten_owner_design(value, child))
    return flattened


@pytest.mark.skipif(
    not REFERENCE_THEME_DIR.is_dir(),
    reason="the owner's project is not committed; the token table covers CI",
)
def test_the_token_table_is_the_owners_whole_design_block():
    """The table above is his block - every key, nothing invented.

    This is what makes the exhaustive pin *exhaustive*. Without it the table
    is still just a list somebody typed, and the failure mode that produced
    this ticket - a token nobody transcribed - comes straight back. With it,
    a token the owner has and applika does not fails here by name.

    ``theme`` is the one excluded key: his file says ``custom`` and applika's
    says ``applika``.
    """
    owner = _flatten_owner_design(_owner_design_block())
    owner.pop('theme', None)
    assert owner == OWNER_DESIGN_TOKENS, msg(
        "the owner's design block, flattened",
        {
            'missing_from_the_table': sorted(
                set(owner) - set(OWNER_DESIGN_TOKENS)
            ),
            'not_in_the_owners_block': sorted(
                set(OWNER_DESIGN_TOKENS) - set(owner)
            ),
            'different_value': {
                key: (owner[key], OWNER_DESIGN_TOKENS[key])
                for key in set(owner) & set(OWNER_DESIGN_TOKENS)
                if owner[key] != OWNER_DESIGN_TOKENS[key]
            },
        },
    )


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
    """A current role: ``start_date`` alone, and never RenderCV's ``date``.

    The owner: "finish is optional, when empty is counted as Present". The
    mapper does **not** write the word - it omits ``end_date`` and RenderCV's
    own ``check_and_adjust_dates`` fills in ``present``.
    """
    entry = _sections()[EXPERIENCE_SECTION][0]
    assert entry == {
        'company': 'Acme',
        'position': 'Staff Engineer',
        'start_date': '2024-02',
        'location': 'Lisbon, PT',
        'summary': 'Anvils, mostly',
        'highlights': ['Cut p99 by half', 'Owned the billing rewrite'],
    }, msg('the mapped experience entry', entry)


def test_a_finished_experience_carries_both_dates():
    entry = _sections()[EXPERIENCE_SECTION][1]
    assert entry == {
        'company': 'Globex',
        'position': 'Senior Engineer',
        'start_date': '2023-02',
        'end_date': '2024-02',
    }, msg('a closed date range', entry)


@pytest.mark.parametrize(
    'section', [EXPERIENCE_SECTION, EDUCATION_SECTION]
)
def test_no_dated_entry_ever_emits_rendercv_s_arbitrary_date(section):
    """``date`` and ``start_date`` are mutually exclusive, and silently so.

    ``BaseEntryWithComplexFields.check_and_adjust_dates`` clears ``start_date``
    and ``end_date`` the moment ``date`` is set. An entry that emitted both
    would render the ``date`` string and throw the period away - a PDF that
    compiles and is wrong, which is the failure mode this whole ticket exists
    to remove.
    """
    for entry in _sections()[section]:
        assert 'date' not in entry, msg('no arbitrary date key', entry)
        assert 'start_date' in entry, msg('a start_date', entry)


def test_a_blank_start_on_experience_omits_both_date_keys():
    """Defensive: the schema requires ``start``, but a bare row must not 500.

    Emitting ``end_date`` with no ``start_date`` is worse than emitting
    nothing - RenderCV folds a lone ``end_date`` back into ``date`` and prints
    a finish with no beginning. An entry carrying neither key never reaches
    ``process_date`` at all (``entry_fields`` is built from the entry's own
    set fields), so it renders undated instead of raising.

    ``model_construct`` is the only way in: ``start`` is required and
    pattern-checked, so no validated payload can produce this shape.
    """
    item = ExperienceItem.model_construct(
        id='exp-x',
        company='Acme',
        role='Staff Engineer',
        start='',
        end='2024-02',
    )
    entry = _sections_unvalidated(experience=[item])[EXPERIENCE_SECTION][0]

    assert entry == {'company': 'Acme', 'position': 'Staff Engineer'}, msg(
        'no date key of any kind', entry
    )


def test_a_blank_start_on_education_omits_both_date_keys():
    """The same defence on the other dated section."""
    item = EducationItem.model_construct(
        id='edu-x',
        institution='Riverside Institute',
        degree='Certificate',
        area=None,
        start='',
        end='2019-07',
    )
    entry = _sections_unvalidated(education=[item])[EDUCATION_SECTION][0]

    assert entry == {
        'institution': 'Riverside Institute',
        'area': '',
        'degree': 'Certificate',
    }, msg('no date key of any kind', entry)


def test_a_project_is_three_lines_name_then_link_then_description():
    """The owner: name, then the link, then the description - never one line.

    Line one is the entry ``name``; lines two and three are the ``summary``,
    split by a newline. The order matters as much as the break: before this
    ticket the mapper emitted ``description + " " + link`` on a single line.
    """
    entry = _sections()[PROJECTS_SECTION][0]
    assert entry['name'] == 'applika', msg('applika', entry['name'])
    assert entry['summary'] == (
        '[applika.example.com](https://applika.example.com)\n'
        'Job application tracker'
    ), msg('link line, then description line', entry['summary'])


def test_a_project_with_no_link_label_shows_the_raw_url():
    """The owner: "if link label is missing, just display the raw link"."""
    entry = _sections()[PROJECTS_SECTION][1]
    assert entry['summary'] == (
        '[https://example.org/slowquery](https://example.org/slowquery)\n'
        'Samples slow query plans'
    ), msg('the URL as its own label', entry['summary'])


def test_a_project_with_no_link_is_name_and_description_only():
    """Two lines, not a leading blank one."""
    entry = _sections(
        projects=[
            {
                'id': 'p1',
                'name': 'applika',
                'description': 'Job application tracker',
                'link': None,
                'link_label': None,
            }
        ]
    )[PROJECTS_SECTION][0]
    assert entry['summary'] == 'Job application tracker', msg(
        'the description alone', entry['summary']
    )


def test_a_project_with_no_description_is_name_and_link_only():
    entry = _sections(
        projects=[
            {
                'id': 'p1',
                'name': 'applika',
                'description': '',
                'link': 'https://applika.example.com',
                'link_label': 'Live',
            }
        ]
    )[PROJECTS_SECTION][0]
    assert entry['summary'] == '[Live](https://applika.example.com)', msg(
        'the link alone', entry['summary']
    )


# --- The mapper: skills are categories, not tags ------------------------------


def test_each_skill_category_is_its_own_entry():
    """The owner: a category, and keywords inside it - one block each.

    A NormalEntry, so ClassicTheme's own template puts the category bold on
    its own line with the keywords beneath. It must not become a OneLineEntry:
    see ``test_languages_is_the_only_one_line_entry``.
    """
    entries = _sections()[SKILLS_SECTION]
    assert entries[0] == {
        'name': 'Languages & Frameworks:',
        'summary': 'Python · PostgreSQL · FastAPI',
    }, msg('a bold category line and its keywords', entries[0])


def test_keywords_are_joined_by_a_middle_dot_not_a_bullet():
    """U+00B7 MIDDLE DOT, the glyph the owner typeset his own skills with.

    Spelled out by codepoint because the two characters this could be are
    indistinguishable in a diff: U+2022 BULLET is the *header's* connection
    separator and belongs nowhere near the skills line.
    """
    summary = _sections()[SKILLS_SECTION][0]['summary']
    assert '\u00b7' in summary, msg('a middle dot', summary)
    assert '\u2022' not in summary, msg('no bullet', summary)


def test_a_category_gets_a_colon_appended():
    """The user types the category; applika types the colon."""
    entry = _sections(
        skills=[{'id': 's1', 'category': 'Testing & QA', 'keywords': ['Jest']}]
    )[SKILLS_SECTION][0]
    assert entry['name'] == 'Testing & QA:', msg('Testing & QA:', entry['name'])


def test_a_category_that_already_ends_in_a_colon_does_not_get_a_second():
    entry = _sections()[SKILLS_SECTION][1]
    assert entry['name'] == 'Platform & Delivery:', msg(
        'one colon', entry['name']
    )


def test_a_category_with_no_keywords_keeps_its_heading():
    """An empty category still round-trips; it prints its bold line alone."""
    entry = _sections()[SKILLS_SECTION][2]
    assert entry == {'name': 'Practices:'}, msg('no summary key', entry)


def test_a_category_with_neither_a_name_nor_a_keyword_is_dropped():
    sections = _sections(
        skills=[{'id': 's1', 'category': '   ', 'keywords': ['', '  ']}]
    )
    assert SKILLS_SECTION not in sections, msg('no Skills heading', sections)


# --- The mapper: education ----------------------------------------------------


def test_education_maps_to_an_education_entry():
    """Education is dated by ``start``/``end``, exactly like experience.

    The owner changed both sections in one breath, so both map onto RenderCV's
    ``start_date``/``end_date`` and neither touches the arbitrary ``date``.
    The institution/degree/area/date layout comes from
    ``templates.education_entry``, not from a template file.
    """
    entry = _sections()[EDUCATION_SECTION][0]
    assert entry == {
        'institution': 'Riverside Institute',
        'area': 'Distributed Systems',
        'degree': "Master's degree",
        'start_date': '2016-09',
        'end_date': '2018-07',
    }, msg('the mapped education entry', entry)


def test_an_ongoing_course_omits_its_end_date():
    """A course still running has no ``end`` and prints ``present``."""
    entry = _sections(
        education=[
            {
                'id': 'e1',
                'institution': 'Riverside Institute',
                'degree': 'PhD',
                'area': 'Distributed Systems',
                'start': '2025-09',
            }
        ]
    )[EDUCATION_SECTION][0]
    assert entry['start_date'] == '2025-09', msg('2025-09', entry)
    assert 'end_date' not in entry, msg('no end_date key', entry)


def test_education_without_an_area_still_maps():
    """``area`` is required by RenderCV, so it is always sent.

    Empty when the user left it blank, which RenderCV reads as "not
    provided" and drops from the ``DEGREE_WITH_AREA`` phrase rather than
    printing a dangling "in".
    """
    entry = _sections(
        education=[
            {
                'id': 'e1',
                'institution': 'Riverside Institute',
                'degree': 'Certificate',
                'area': None,
                'start': '2019-01',
            }
        ]
    )[EDUCATION_SECTION][0]
    assert entry == {
        'institution': 'Riverside Institute',
        'area': '',
        'degree': 'Certificate',
        'start_date': '2019-01',
    }, msg('an area key and a start_date', entry)


def test_an_entirely_blank_education_item_is_dropped():
    """Unreachable through the schema now, still guarded in the mapper."""
    sections = _sections_unvalidated(
        education=[
            EducationItem.model_construct(
                id='e1', institution=' ', degree=' ', area='  ', start=''
            )
        ]
    )
    assert EDUCATION_SECTION not in sections, msg(
        'no Education heading', sections
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


def test_unknown_link_becomes_a_custom_header_connection():
    """RenderCV knows a closed list of networks; the rest stay in the header.

    The owner: "Links isn't a section, it must appear in bellow the headline,
    alongside with my email, location and links." ``custom_connections``
    rather than ``cv.website`` because ``parse_connections`` sets a website's
    body to ``clean_url(url)`` and drops the label, while a custom
    connection's body is its ``placeholder`` - so "Site" survives.
    """
    cv_block = map_cv_to_rendercv_document(_cv())['cv']
    assert cv_block['custom_connections'] == [
        {
            'fontawesome_icon': LINK_CONNECTION_ICON,
            'placeholder': 'Site',
            'url': 'https://ada.example.com',
        }
    ], msg('one custom connection', cv_block.get('custom_connections'))


def test_custom_connections_come_after_the_social_networks():
    """``Cv.capture_input_order`` makes this dict's key order the header order.

    ``parse_connections`` walks ``cv._key_order``, so emitting
    ``custom_connections`` before ``social_networks`` would put a personal
    site ahead of GitHub on the line.
    """
    keys = list(map_cv_to_rendercv_document(_cv())['cv'])
    assert keys.index('custom_connections') > keys.index('social_networks'), (
        msg('custom_connections after social_networks', keys)
    )


def test_a_link_with_no_label_falls_back_to_the_cleaned_url():
    """The URL stands in for the label, minus the protocol RenderCV strips."""
    cv_block = map_cv_to_rendercv_document(
        _cv(links=[{'id': 'l1', 'label': '', 'url': 'https://ada.example.com'}])
    )['cv']
    assert cv_block['custom_connections'] == [
        {
            'fontawesome_icon': LINK_CONNECTION_ICON,
            'placeholder': 'ada.example.com',
            'url': 'https://ada.example.com',
        }
    ], msg('a placeholder built from the URL', cv_block['custom_connections'])


def test_the_link_icon_is_never_blank():
    """``show_icons`` is off, but ``CustomConnection`` still requires a name.

    An empty string would fail RenderCV's own validation before the theme
    ever got the chance to not draw it.
    """
    assert LINK_CONNECTION_ICON, msg(
        'a Font Awesome name', LINK_CONNECTION_ICON
    )


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


def test_links_are_never_a_section():
    """The owner's ruling, asserted on the mapper: ``Links`` is not a title.

    It used to be one - KODI-004 added a ``Links`` section as the fallback for
    a link RenderCV could not turn into a social network, and KODI-006 made it
    the trailing section. The owner never asked for that: "Links isn't a
    section, it must appear in bellow the headline". No stored link, of any
    shape, may put a title back.
    """
    for links in (
        FULL_SECTIONS['links'],
        [{'id': 'l1', 'label': 'GitHub', 'url': 'https://github.com/ada'}],
        [{'id': 'l1', 'label': 'Site', 'url': 'https://ada.example.com'}],
        [{'id': 'l1', 'label': '', 'url': 'https://ada.example.com'}],
        [{'id': 'l1', 'label': 'Blog', 'url': 'not a url'}],
    ):
        sections = _sections(links=links)
        assert 'Links' not in sections, msg('no Links section', sections)


def test_a_link_url_rendercv_would_refuse_is_dropped_from_the_header():
    """applika's link column is free text; ``pydantic.HttpUrl`` is not.

    The behaviour this changes on purpose: ``not a url`` and a scheme-less
    ``github.com/ada`` used to print in the Links section. Now that the
    section is gone they are dropped instead, the same way an unusable email
    or phone already was - the alternative is a 500 on the user's own CV.
    """
    cv_block = map_cv_to_rendercv_document(
        _cv(
            links=[
                {'id': 'l1', 'label': 'Blog', 'url': 'not a url'},
                {'id': 'l2', 'label': 'Repo', 'url': 'github.com/ada'},
                {'id': 'l3', 'label': 'Blank', 'url': '   '},
                {'id': 'l4', 'label': 'Site', 'url': 'https://ada.example.com'},
            ]
        )
    )['cv']
    assert [c['placeholder'] for c in cv_block['custom_connections']] == [
        'Site'
    ], msg('only the valid URL', cv_block.get('custom_connections'))
    assert 'Links' not in cv_block.get('sections', {}), msg(
        'no Links section', cv_block.get('sections')
    )


def test_a_cv_whose_links_are_all_unusable_has_no_custom_connections():
    cv_block = map_cv_to_rendercv_document(
        _cv(links=[{'id': 'l1', 'label': 'Blog', 'url': 'not a url'}])
    )['cv']
    assert 'custom_connections' not in cv_block, msg(
        'no empty custom_connections key', cv_block
    )


# --- The mapper: an empty section is omitted, never emitted blank -------------


@pytest.mark.parametrize(
    ('field', 'section'),
    [
        ('summary', SUMMARY_SECTION),
        ('experience', EXPERIENCE_SECTION),
        ('projects', PROJECTS_SECTION),
        ('education', EDUCATION_SECTION),
        ('skills', SKILLS_SECTION),
        ('certifications', CERTIFICATIONS_SECTION),
        ('languages', LANGUAGES_SECTION),
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
        skills=[{'id': 's1', 'category': '  ', 'keywords': ['']}],
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
        skills=[{'id': 's1', 'category': '#DevOps', 'keywords': ['#IaC']}],
    )
    summary = sections[SUMMARY_SECTION][0]
    assert '#opentowork' not in summary, msg('neutralized hash', summary)
    assert 'sym.hash' in summary, msg('a hash symbol command', summary)
    assert 'opentowork' in summary, msg('the word survives', summary)
    skills_entry = sections[SKILLS_SECTION][0]
    assert 'sym.hash' in skills_entry['name'], msg(
        'a neutralized category', skills_entry['name']
    )
    assert 'sym.hash' in skills_entry['summary'], msg(
        'a neutralized keyword', skills_entry['summary']
    )


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
    throw the count off; Typst ``//`` comments are *not*, because no template
    carries one today - add that if a template ever comments out a delimiter.
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


def _headings(source: str) -> list[str]:
    """Every ``== Title`` heading in a generated Typst document, in order."""
    return [
        line[len('== ') :].strip()
        for line in source.splitlines()
        if line.startswith('== ')
    ]


def _yaml_section_order(yaml_text: str) -> list[str]:
    """The section keys of a generated input file, in the order they appear.

    Read off the raw text rather than a parsed mapping on purpose: the bug
    this guards lives in the *dump*, not in the document, so a test that
    re-parsed the YAML into a dict would pass while the file on disk said
    something else.
    """
    order: list[str] = []
    inside = False
    for line in yaml_text.splitlines():
        if line.rstrip() == '  sections:':
            inside = True
            continue
        if not inside:
            continue
        if not line.startswith('    ') or line.startswith('     '):
            continue
        stripped = line.strip()
        if stripped.endswith(':') and not stripped.startswith('-'):
            order.append(stripped[:-1])
    return order


# The order the owner asked for, spelled out here rather than imported from
# ``SECTION_ORDER`` so the expectation and the implementation cannot drift
# together. It ends at ``Certifications`` and nothing follows it: "Links isn't
# a section, it must appear in bellow the headline, alongside with my email,
# location and links."
EXPECTED_SECTION_ORDER = [
    'Summary',
    'Experience',
    'Languages',
    'Skills',
    'Projects',
    'Education',
    'Certifications',
]


def test_the_mappers_section_order_constant_is_the_owners_order():
    assert list(SECTION_ORDER) == EXPECTED_SECTION_ORDER, msg(
        EXPECTED_SECTION_ORDER, list(SECTION_ORDER)
    )


def test_the_generated_yaml_carries_the_sections_in_the_owners_order():
    """The owner: "Summary MUST BE ON TOP, followed by experience, languages,
    skills, projects (optionally), education and certifications (optionally)."

    This is the assertion the previous slice did not have. ``_sections()``
    always inserted in *an* order; ``ruamel.yaml``'s representer then sorted
    every mapping's keys on the way out and the page came back alphabetical,
    with the summary at the bottom. Nothing about the mapper's dict shows it -
    only the serialized text does.
    """
    order = _yaml_section_order(map_cv_to_rendercv_yaml(_cv()))
    assert order == EXPECTED_SECTION_ORDER, msg(EXPECTED_SECTION_ORDER, order)


def test_the_generated_yaml_is_not_sorted_alphabetically():
    """The specific failure, named: ``Certifications`` cannot come first."""
    order = _yaml_section_order(map_cv_to_rendercv_yaml(_cv()))
    assert order != sorted(order), msg(
        'insertion order, not alphabetical', order
    )
    assert order[0] == SUMMARY_SECTION, msg(SUMMARY_SECTION, order[0])


def test_the_rendered_typst_carries_the_sections_in_the_owners_order(tmp_path):
    """The same order, one layer further down - through the real theme.

    The YAML test proves the dump; this proves RenderCV walks the mapping as
    given rather than reordering it itself.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    assert _headings(source) == EXPECTED_SECTION_ORDER, msg(
        EXPECTED_SECTION_ORDER, _headings(source)
    )


@pytest.mark.parametrize(
    ('field', 'section'),
    [
        ('projects', PROJECTS_SECTION),
        ('education', EDUCATION_SECTION),
        ('certifications', CERTIFICATIONS_SECTION),
    ],
)
def test_an_optional_section_leaves_no_heading_in_the_rendered_typst(
    tmp_path, field: str, section: str
):
    """The owner marked three sections optional; empty means *absent*.

    Asserted on the generated source rather than on the mapper's dict because
    a heading RenderCV printed over nothing is what the user would see.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv(**{field: []})), tmp_path
    ).read_text(encoding='utf-8')
    headings = _headings(source)
    assert section not in headings, msg(f'no {section} heading', headings)
    assert headings == [
        title for title in EXPECTED_SECTION_ORDER if title != section
    ], msg('the rest of the order intact', headings)


def test_a_skill_category_typesets_as_a_bold_line_over_its_keywords(tmp_path):
    """The category prints as a bold line, its keywords on the line beneath.

    ``#strong[...]`` on its own followed by ``#summary[...]`` is RenderCV's
    NormalEntry, which is the shape the owner's own skills section uses. A
    regression to one joined line, or to a OneLineEntry, fails here.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    skills_block = source.split(f'== {SKILLS_SECTION}', 1)[1].split('\n== ')[0]

    assert '#strong[Languages & Frameworks:]' in skills_block, msg(
        'a bold category line', skills_block[:400]
    )
    assert 'Python \u00b7 PostgreSQL \u00b7 FastAPI' in skills_block, msg(
        'keywords joined by a middle dot', skills_block[:400]
    )
    assert '#strong[Practices:]' in skills_block, msg(
        'a keywordless category keeps its line', skills_block[:400]
    )


def test_a_project_breaks_its_line_between_the_link_and_the_description(
    tmp_path,
):
    """The newline has to survive into Typst as a real break.

    A ``\n`` inside a NormalEntry summary is markdown, not Typst, so nothing
    about the mapper guarantees it becomes a line break - RenderCV has to turn
    it into Typst's ``\\`` for it to. If it ever stops doing so the owner is
    back to "you are putting the description and link in a same line", and a
    PDF that compiled cleanly would not show it.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    projects_block = source.split(f'== {PROJECTS_SECTION}', 1)[1].split(
        '\n== '
    )[0]

    assert (
        '#link("https://applika.example.com")[applika.example.com] \\ '
        'Job application tracker' in projects_block
    ), msg('a Typst line break between link and description', projects_block)
    assert '#strong[applika]' in projects_block, msg(
        'the project name on its own line', projects_block
    )


def test_education_typesets_institution_then_degree_then_date(tmp_path):
    """The owner's ``education_entry`` template, end to end.

    No vendored education template exists, so if the three
    ``templates.education_entry`` tokens ever drop out of ``ApplikaTheme``
    this section silently reverts to ClassicTheme's ``**INSTITUTION**, AREA``
    with a separate degree column - a different-looking CV that still renders.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    education_block = source.split(f'== {EDUCATION_SECTION}', 1)[1].split(
        '\n== '
    )[0]

    assert 'Riverside Institute' in education_block
    assert "Master's degree in Distributed Systems" in education_block, msg(
        'the DEGREE_WITH_AREA phrase', education_block[:400]
    )
    # ``\\/`` and not ``/``: RenderCV escapes the slash on its way into Typst
    # (a bare ``/`` starts a list item there). The PDF prints ``09/2016``.
    #
    # This is the owner's two tokens doing their work on stored ISO months:
    # ``single_date: MONTH_IN_TWO_DIGITS/YEAR`` turns ``2016-09`` into
    # ``09/2016``, and ``date_range: START_DATE - END_DATE`` joins the pair.
    # Nothing in applika formats a date.
    assert '09\\/2016 - 07\\/2018' in education_block, msg(
        'the stored ISO months typeset as MM/yyyy', education_block[:400]
    )
    assert '#strong[Riverside Institute]' not in education_block, msg(
        "the owner's template does not bold the institution",
        education_block[:400],
    )


def test_experience_typesets_mm_yyyy_ranges_and_present(tmp_path):
    """AC3 + AC4, end to end through the real theme, on the generated Typst.

    Two assertions, and both are the point of the whole ticket:

    * a finished role prints ``02/2023 - 02/2024`` - stored ISO months, run
      through the owner's own ``single_date``/``date_range`` tokens, come out
      as ``MM/yyyy`` on the page with nothing in applika formatting them;
    * the current role prints ``02/2024 - present``. The mapper never writes
      that word. RenderCV's ``check_and_adjust_dates`` sets
      ``end_date = "present"`` because ``start_date`` was given and
      ``end_date`` was not, which is exactly what the owner asked for: "finish
      is optional, when empty is counted as Present".

    ``\\/`` rather than ``/``: RenderCV escapes the slash on its way into
    Typst, where a bare ``/`` starts a list item. The PDF shows ``02/2024``.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    experience_block = source.split(f'== {EXPERIENCE_SECTION}', 1)[1].split(
        '\n== '
    )[0]

    assert '02\\/2024 - present' in experience_block, msg(
        'the current role as MM/yyyy - present', experience_block[:600]
    )
    assert '02\\/2023 - 02\\/2024' in experience_block, msg(
        'the finished role as an MM/yyyy range', experience_block[:600]
    )
    # ``show_time_spans_in=[]`` still holds: no "1 year 2 months" tail.
    assert 'year' not in experience_block, msg(
        'no time span appended to the range', experience_block[:600]
    )


def test_education_is_not_a_one_line_entry(tmp_path):
    """One grid, still - education must not open or close a second.

    ``SectionEnding.j2.typ`` closes a ``)`` for every OneLineEntry section
    while ``SectionBeginning.j2.typ`` opens the grid for ``languages`` alone,
    and Typst prints the orphan as text rather than failing. A CV carrying
    education has to leave the balance untouched.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    assert f'== {EDUCATION_SECTION}' in source, msg('an Education heading', '')
    assert source.count('#grid(') == 1, msg(1, source.count('#grid('))
    assert _delimiter_balance(source) == (0, 0, 0, 0), msg(
        'balanced Typst delimiters', _delimiter_balance(source)
    )


def test_a_cv_with_languages_and_certifications_is_well_formed(tmp_path):
    """The two pair-shaped sections together, through the real theme.

    Both used to be OneLineEntry: only ``Languages`` opens the grid the
    owner's ``SectionEnding.j2.typ`` closes, so ``Certifications`` printed a
    literal ``[``, ``],`` and ``)`` around every entry. Reverting the mapper
    to OneLineEntry for it drives the paren depth negative here and fails
    this test. This CV also carries a non-social link, which must not disturb
    the balance now that it lives in the header.
    """
    yaml_text = map_cv_to_rendercv_yaml(_cv())
    source = generate_typst_source(yaml_text, tmp_path).read_text(
        encoding='utf-8'
    )

    for section in (LANGUAGES_SECTION, CERTIFICATIONS_SECTION):
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


def test_certifications_typeset_as_bold_label_then_details(tmp_path):
    """The replacement reads like the entry it replaced.

    A OneLineEntry typesets a semibold label followed by normal details. The
    TextEntry line has to land on the same thing - bold name, then issuer -
    or the fix traded broken markup for a different-looking CV.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')

    assert '#strong[AWS SAA] Amazon' in source, msg(
        'a bold certification name followed by its issuer',
        source[source.find(f'== {CERTIFICATIONS_SECTION}') :][:200],
    )


# --- Links is not a section: it is part of the header line -------------------
#
# The owner, on the exported PDF: "when i downloaded the pdf in the end of the
# file appeared a new section with name Links. Links isn't a section, it must
# appear in bellow the headline, alongside with my email, location and links."
#
# These assert on the generated ``.typ`` rather than on a compile, because
# Typst prints broken markup as ordinary text instead of failing - a green
# render proves nothing on its own (see :func:`_delimiter_balance`).


def _header_connections(source: str) -> str:
    """The ``#connections(...)`` call the frozen ``Header.j2.typ`` emits."""
    start = source.index('#connections(')
    return source[start : source.index('\n)', start) + 2]


def test_the_rendered_typst_has_no_links_heading(tmp_path):
    """No ``== Links``, and no heading containing the word at all."""
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')

    assert '== Links' not in source, msg('no Links heading', '== Links')
    assert not [h for h in _headings(source) if 'Links' in h], msg(
        'no heading naming Links', _headings(source)
    )


def test_the_last_rendered_section_is_certifications(tmp_path):
    """Nothing comes after ``Certifications`` - the owner's order ends there."""
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    assert _headings(source)[-1] == CERTIFICATIONS_SECTION, msg(
        CERTIFICATIONS_SECTION, _headings(source)
    )


def test_a_plain_link_is_hyperlinked_in_the_header_beside_email_and_location(
    tmp_path,
):
    """The fix, proved on the markup the compiler is handed.

    One recognised social network and one plain non-social URL on the same
    CV: both have to sit inside the single ``#connections(...)`` call, on the
    same line as the location and the email, each wrapped in a ``#link``.
    ``custom_connections`` is what keeps the user's label - a ``cv.website``
    would have printed ``ada.example.com`` instead of ``Site``.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    connections = _header_connections(source)

    assert 'Lisbon, PT' in connections, msg('the location', connections)
    assert 'ada\\@example.com' in connections, msg('the email', connections)
    assert (
        '#link("https://github.com/ada", icon: false, if-underline: false,'
        ' if-color: false)[ada]' in connections
    ), msg('the GitHub connection', connections)
    assert (
        '#link("https://ada.example.com/", icon: false, if-underline: false,'
        ' if-color: false)[Site]' in connections
    ), msg('the plain link, labelled and hyperlinked', connections)


def test_the_plain_link_follows_the_social_network_in_the_header(tmp_path):
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    connections = _header_connections(source)
    assert connections.index('ada.example.com') > connections.index(
        'github.com/ada'
    ), msg('the plain link after the network', connections)


def test_the_header_stays_balanced_with_a_custom_connection(tmp_path):
    """A custom connection must not unbalance the frozen header template."""
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(_cv()), tmp_path
    ).read_text(encoding='utf-8')
    assert _delimiter_balance(source) == (0, 0, 0, 0), msg(
        'balanced Typst delimiters', _delimiter_balance(source)
    )


def test_a_link_rendercv_would_refuse_leaves_the_rest_of_the_cv_rendering(
    tmp_path,
):
    """The behaviour change, pinned: dropped from the header, not a 500.

    Before this fix an unparseable URL still printed, in the Links section.
    With the section gone the only alternatives are dropping it or letting
    ``pydantic.HttpUrl`` raise on the user's own CV, and RenderCV raising is
    how a download becomes a 500.
    """
    source = generate_typst_source(
        map_cv_to_rendercv_yaml(
            _cv(
                links=[
                    {'id': 'l1', 'label': 'Blog', 'url': 'not a url'},
                    {'id': 'l2', 'label': 'Repo', 'url': 'github.com/ada'},
                    {
                        'id': 'l3',
                        'label': 'Site',
                        'url': 'https://ada.example.com',
                    },
                ]
            )
        ),
        tmp_path,
    ).read_text(encoding='utf-8')

    connections = _header_connections(source)
    assert 'Blog' not in connections, msg('no unparseable link', connections)
    assert 'Repo' not in connections, msg('no scheme-less link', connections)
    assert 'Site' in connections, msg('the usable link', connections)
    assert _headings(source) == EXPECTED_SECTION_ORDER, msg(
        EXPECTED_SECTION_ORDER, _headings(source)
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
