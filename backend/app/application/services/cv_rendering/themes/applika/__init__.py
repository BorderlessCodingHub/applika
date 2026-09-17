"""The ``applika`` RenderCV theme - the one fixed look of every exported CV.

Derived from the owner's own RenderCV theme, renamed ``custom`` -> ``applika``
and hardened into code: every design token the owner set by hand in a YAML
``design`` block is an overridden field default here, so the rendered YAML only
ever has to say ``design: {theme: applika}`` and the user never picks a theme
(docs/applika/adr/0011-server-side-cv-pdf-rendercv.md).

RenderCV finds this package by convention, not by import: it looks for a folder
named exactly the theme name **next to the input YAML file**, loads this
``__init__.py`` through ``importlib.util.spec_from_file_location`` and expects a
class called ``<Theme>Theme`` - hence ``ApplikaTheme``. That is why the imports
below must stay absolute and must never reach into ``app``: at render time this
file is executed as a standalone module called ``theme``, outside the ``app``
package, from a copy of this folder in a temporary directory.

The ``.j2.typ`` files beside this one are the Typst templates the theme
overrides; everything else falls back to RenderCV's ``classic`` theme.
"""

from typing import Literal

import pydantic
from rendercv.schema.models.design.classic_theme import (
    ClassicTheme,
    Color,
    Colors,
    Connections,
    Entries,
    FontSize,
    Header,
    Highlights,
    Page,
    SectionTitles,
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
    """Near-black ink throughout; only links carry the accent blue."""
    return Colors(
        body=Color('rgb(25, 25, 25)'),
        name=Color('rgb(10, 10, 10)'),
        headline=Color('rgb(55, 55, 55)'),
        connections=Color('rgb(65, 65, 65)'),
        section_titles=Color('rgb(10, 10, 10)'),
        links=Color('rgb(25, 95, 175)'),
    )


def _typography() -> Typography:
    """Source Sans 3, justified with hyphenation off, name big and bold."""
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
    )


def _header() -> Header:
    """Centered header; connections separated by a bullet, no icons.

    ``show_icons`` is deliberately ``False``: RenderCV's default is ``True``,
    which pulls a whole FontAwesome face into the PDF for glyphs this theme
    does not want. They stay hyperlinked.
    """
    return Header(
        alignment='center',
        connections=Connections(
            hyperlink=True,
            show_icons=False,
            separator='•',
        ),
    )


def _section_titles() -> SectionTitles:
    """Centered title with a hairline rule continuing to the margin."""
    return SectionTitles(
        type='centered_with_partial_line',
        line_thickness='0.1pt',
    )


def _entries() -> Entries:
    return Entries(highlights=Highlights(bullet='•'))


def _templates() -> Templates:
    """Numeric dates: ``09/2026``, and ranges joined by a plain hyphen."""
    return Templates(
        single_date='MONTH_IN_TWO_DIGITS/YEAR',
        date_range='START_DATE - END_DATE',
    )


class ApplikaTheme(ClassicTheme):
    """RenderCV design model for the fixed ``applika`` theme.

    Every field below narrows a ``ClassicTheme`` default to the owner's token.
    Anything not listed is inherited on purpose.
    """

    theme: Literal['applika'] = 'applika'
    page: Page = pydantic.Field(default_factory=_page)
    colors: Colors = pydantic.Field(default_factory=_colors)
    typography: Typography = pydantic.Field(default_factory=_typography)
    header: Header = pydantic.Field(default_factory=_header)
    section_titles: SectionTitles = pydantic.Field(
        default_factory=_section_titles
    )
    entries: Entries = pydantic.Field(default_factory=_entries)
    templates: Templates = pydantic.Field(default_factory=_templates)
