"""The ``applika`` RenderCV theme - the one fixed look of every exported CV.

Derived from the owner's own RenderCV theme, renamed ``custom`` -> ``applika``
and hardened into code: every design token the owner set by hand in a YAML
``design`` block is an overridden field default here, so the rendered YAML only
ever has to say ``design: {theme: applika}`` and the user never picks a theme
(docs/adr/0011-server-side-cv-pdf-rendercv.md).

**Every token, not a selection.** The first cut of this file reproduced about
half the owner's block - the half a prose step list happened to name - and the
half it dropped was the spacing: ``header.space_below_name``,
``header.space_below_headline``, ``header.space_below_connections``, the whole
``sections`` block and the whole ``entries`` geometry. The owner's verdict on
the result was "you forgot completelly what i said during plan and deviate in
40%", and the gap he saw was exactly those missing defaults. So the rule now is
that **a token the owner wrote is set here even when it happens to equal
RenderCV's own default**: the reproduction is of his file, not of the delta
against ``ClassicTheme``, and a RenderCV release that moves a default must not
be able to move our look. ``tests/unit/test_cv_rendering.py`` pins each one
individually.

RenderCV finds this package by convention, not by import: it looks for a folder
named exactly the theme name **next to the input YAML file**, loads this
``__init__.py`` through ``importlib.util.spec_from_file_location`` and expects a
class called ``<Theme>Theme`` - hence ``ApplikaTheme``. That is why the imports
below must stay absolute and must never reach into ``app``: at render time this
file is executed as a standalone module called ``theme``, outside the ``app``
package, from a copy of this folder in a temporary directory.

The ``.j2.typ`` files beside this one are the Typst templates the theme
overrides; everything else falls back to RenderCV's ``classic`` theme -
including ``EducationEntry``, which is why the education section needs no
template of its own and gets its layout from ``templates.education_entry``
below.
"""

from typing import Literal

import pydantic
from rendercv.schema.models.design.classic_theme import (
    Bold,
    ClassicTheme,
    Color,
    Colors,
    Connections,
    EducationEntry,
    Entries,
    FontSize,
    Header,
    Highlights,
    Links,
    Page,
    Sections,
    SectionTitles,
    SmallCaps,
    Summary,
    Templates,
    Typography,
)


def _page() -> Page:
    """A4, tight margins, and neither the footer nor the top note."""
    return Page(
        size='a4',
        top_margin='0.55in',
        bottom_margin='0.55in',
        left_margin='0.6in',
        right_margin='0.6in',
        show_footer=False,
        show_top_note=False,
    )


def _colors() -> Colors:
    """Near-black ink throughout; only links carry the accent blue.

    ``footer`` and ``top_note`` are set even though neither is printed
    (``page.show_footer`` and ``page.show_top_note`` are off): they are in the
    owner's block, and this file reproduces his block.
    """
    return Colors(
        body=Color('rgb(25, 25, 25)'),
        name=Color('rgb(10, 10, 10)'),
        headline=Color('rgb(55, 55, 55)'),
        connections=Color('rgb(65, 65, 65)'),
        section_titles=Color('rgb(10, 10, 10)'),
        links=Color('rgb(25, 95, 175)'),
        footer=Color('rgb(150, 150, 150)'),
        top_note=Color('rgb(150, 150, 150)'),
    )


def _typography() -> Typography:
    """Source Sans 3, justified with hyphenation off, name big and bold.

    ``font_family`` is given as the bare string the owner wrote; RenderCV's
    own validator fans it out to all five elements.
    """
    return Typography(
        line_spacing='0.65em',
        alignment='justified-with-no-hyphenation',
        font_family='Source Sans 3',
        font_size=FontSize(
            body='10pt',
            name='26pt',
            headline='11pt',
            connections='9pt',
            section_titles='1.2em',
        ),
        small_caps=SmallCaps(
            name=False,
            headline=False,
            connections=False,
            section_titles=False,
        ),
        bold=Bold(
            name=True,
            headline=False,
            connections=False,
            section_titles=True,
        ),
    )


def _header() -> Header:
    """Centered header, tight against the first section title.

    The three ``space_below_*`` values are the owner's "HUGE PROBLEM": left at
    RenderCV's ``0.7cm`` the name, headline and contact line float apart and
    the top of the page reads nothing like his own CV.

    ``show_icons`` is deliberately ``False``: RenderCV's default is ``True``,
    which pulls a whole FontAwesome face into the PDF for glyphs this theme
    does not want. They stay hyperlinked.
    """
    return Header(
        alignment='center',
        space_below_name='0.3cm',
        space_below_headline='0.3cm',
        space_below_connections='0.6cm',
        connections=Connections(
            separator='•',
            show_icons=False,
            hyperlink=True,
            display_urls_instead_of_usernames=False,
            space_between_connections='0.4cm',
        ),
    )


def _links() -> Links:
    """No underline and no external-link glyph; colour carries the link."""
    return Links(underline=False, show_external_link_icon=False)


def _section_titles() -> SectionTitles:
    """Centered title with a hairline rule continuing to the margin."""
    return SectionTitles(
        type='centered_with_partial_line',
        line_thickness='0.1pt',
        space_above='0.5cm',
        space_below='0.5cm',
    )


def _sections() -> Sections:
    """Entry spacing, and no time spans anywhere.

    ``show_time_spans_in`` is empty on purpose: RenderCV defaults it to
    ``['experience']``, which appends "2 years 3 months" to every experience
    date range. The owner's CV shows the range alone.
    """
    return Sections(
        allow_page_break=True,
        space_between_regular_entries='0.95em',
        space_between_text_based_entries='0.2em',
        show_time_spans_in=[],
    )


def _entries() -> Entries:
    """The entry geometry: column widths, side space and bullet spacing."""
    return Entries(
        short_second_row=False,
        side_space='0.1cm',
        space_between_columns='0.15cm',
        date_and_location_width='4.1cm',
        allow_page_break=False,
        summary=Summary(space_above='0.04cm', space_left='0cm'),
        highlights=Highlights(
            bullet='•',
            nested_bullet='◦',
            space_left='0.15cm',
            space_above='0.04cm',
            space_between_items='0.03cm',
            space_between_bullet_and_text='0.5em',
        ),
    )


def _templates() -> Templates:
    """Numeric dates, and the owner's three-line education entry.

    ``education_entry`` is the whole reason applika needs no education
    template of its own: institution on the first line, the degree phrase on
    the second, the date alone in the right-hand column, and no separate
    degree column (``degree_column=None``).
    """
    return Templates(
        education_entry=EducationEntry(
            main_column='INSTITUTION\nDEGREE_WITH_AREA\nSUMMARY\nHIGHLIGHTS',
            date_and_location_column='DATE',
            degree_column=None,
        ),
        single_date='MONTH_IN_TWO_DIGITS/YEAR',
        date_range='START_DATE - END_DATE',
    )


class ApplikaTheme(ClassicTheme):
    """RenderCV design model for the fixed ``applika`` theme.

    Every field below carries the owner's ``design`` block as a default.
    Anything not listed is inherited on purpose.
    """

    theme: Literal['applika'] = 'applika'
    page: Page = pydantic.Field(default_factory=_page)
    colors: Colors = pydantic.Field(default_factory=_colors)
    typography: Typography = pydantic.Field(default_factory=_typography)
    links: Links = pydantic.Field(default_factory=_links)
    header: Header = pydantic.Field(default_factory=_header)
    section_titles: SectionTitles = pydantic.Field(
        default_factory=_section_titles
    )
    sections: Sections = pydantic.Field(default_factory=_sections)
    entries: Entries = pydantic.Field(default_factory=_entries)
    templates: Templates = pydantic.Field(default_factory=_templates)
