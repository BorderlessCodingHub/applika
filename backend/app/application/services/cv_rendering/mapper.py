"""Pure mapper: a stored applika CV document -> a RenderCV input document.

The two stored shapes - ``BaseCVDTO`` (master CV) and ``TailoredCVDTO`` (the
application's copy) - are field-for-field identical for everything that gets
typeset, so one mapper serves both. Nothing here touches the database, the
filesystem or the clock: given a document it returns a dictionary, and given
the same document twice it returns the same dictionary.

A few things this file is careful about.

**The theme is not a parameter.** ``design`` is always ``{theme: applika}``.
The user does not choose a look (docs/applika/adr/0011-server-side-cv-pdf-rendercv.md),
so the caller cannot pass one in.

**A section that is empty is omitted, never emitted blank.** RenderCV would
happily print a "Projects" heading over nothing; a CV with no projects should
simply not have the heading.

**``Languages`` is the only OneLineEntry section, and that is a constraint of
the owner's template, not a preference.** The vendored templates are the
owner's file verbatim (one substitution aside), and in them
``SectionBeginning.j2.typ`` opens a ``#grid(`` only for ``languages`` while
``SectionEnding.j2.typ`` closes one for *every* OneLineEntry section. A second
OneLineEntry section therefore emits an entry cell and a closing paren with no
grid around them, and Typst prints ``[``, ``]``, ``,`` and ``)`` as literal
text rather than failing the compile - broken markup on the page, a green
render. So the other pair-shaped sections - certifications and the links that
are not social networks - are mapped to TextEntry lines (``**label** details``)
instead, which need no grid and read the same.

**Stored data never gets to break the render.** Everything applika stores is
free text: the columns have no format validation, and the user types whatever
they want. RenderCV is far stricter, and three of its rules would otherwise
turn an ordinary CV into a 500:

* ``cv.email`` goes through pydantic's email validator and ``cv.phone`` through
  ``phonenumbers``. A reserved domain or a number that is not dialable raises.
  So each contact value is validated *here*, with RenderCV's own validators,
  and one it would reject is dropped from the header on its own - the rest of
  the CV still renders.
* A link that does not resolve to a social network RenderCV knows falls back to
  a plain entry in the Links section instead of failing.
* ``#word`` in body text is read by RenderCV as a *Typst command* and passed
  through unescaped, so a summary saying ``#opentowork`` aborts the compile
  with "unknown variable". :func:`_neutralize_typst_commands` defuses it.

None of this loosens the 500 path: a render that genuinely cannot be produced
still raises. What it removes is the class of failures caused by data the user
was never told was invalid.
"""

import re
from io import StringIO
from typing import Any, Protocol, runtime_checkable

import ruamel.yaml
from rendercv.schema.models.cv.cv import email_validator, phone_validator
from rendercv.schema.models.cv.social_network import (
    SocialNetwork,
    url_dictionary,
)

THEME_NAME = 'applika'

# Section titles, in the order they are typeset. ``Languages`` is the one the
# theme lays out as a three-column grid (see ``SectionBeginning.j2.typ``), and
# so the only one mapped to OneLineEntry.
SUMMARY_SECTION = 'Summary'
EXPERIENCE_SECTION = 'Experience'
PROJECTS_SECTION = 'Projects'
SKILLS_SECTION = 'Skills'
CERTIFICATIONS_SECTION = 'Certifications'
LANGUAGES_SECTION = 'Languages'
LINKS_SECTION = 'Links'

# How the skills list is joined into its single line.
SKILLS_SEPARATOR = ' • '


@runtime_checkable
class RenderableCV(Protocol):
    """The stored CV shape both ``BaseCVDTO`` and ``TailoredCVDTO`` satisfy.

    Structural on purpose: the mapper has no reason to know whether the
    document it was handed is a master CV or an application's copy, and typing
    it this way keeps the renderer from growing a branch per DTO.
    """

    name: str
    full_name: str
    headline: str
    location: str
    email: str
    phone: str | None
    summary: str
    links: Any
    skills: Any
    experience: Any
    projects: Any
    certifications: Any
    languages: Any


# A ``#`` immediately followed by an ASCII letter: exactly what RenderCV's
# ``typst_command_pattern`` treats as a Typst command and refuses to escape.
_TYPST_COMMAND_START = re.compile(r'#(?=[A-Za-z])')

# A literal hash, then a zero-width gap so the letters after it are not read as
# part of the symbol's name. Same trick RenderCV itself uses for ``*``.
_ESCAPED_HASH = '#sym.hash#h(0pt, weak: true)'


def _clean(value: str | None) -> str:
    """Strip a stored value. Used for URLs and anything not typeset as text."""
    return (value or '').strip()


def _neutralize_typst_commands(value: str) -> str:
    """Make ``#word`` render as the text it is instead of blowing the compile.

    RenderCV escapes ``#``, ``$``, ``[`` and friends for you - except when the
    ``#`` starts what its regex thinks is a Typst command (``#`` + a letter).
    Those it hands to the compiler verbatim, so a CV that says ``#opentowork``
    or ``#DevOps`` dies with ``unknown variable: opentowork`` and the user gets
    a 500 for text they were never warned about.

    Replacing the ``#`` with ``#sym.hash`` plus a weak zero-width space keeps
    the glyph, kills the command, and survives RenderCV's escaping untouched
    (the replacement is itself a valid command, so it is passed through).
    """
    return _TYPST_COMMAND_START.sub(_ESCAPED_HASH, value)


def _text(value: str | None) -> str:
    """Clean a stored value that will be typeset as visible text."""
    return _neutralize_typst_commands(_clean(value))


def _valid_email(value: str | None) -> str | None:
    """Return the email only if RenderCV would accept it, else ``None``."""
    candidate = _clean(value)
    if not candidate:
        return None
    try:
        email_validator.validate_python(candidate)
    except Exception:
        return None
    return candidate


def _valid_phone(value: str | None) -> str | None:
    """Return the phone only if RenderCV would accept it, else ``None``.

    RenderCV needs a dialable international number. applika's column is a free
    string, so anything from ``+351 900 000 000`` to ``call me`` can be in
    there; whatever ``phonenumbers`` refuses is left out of the header.
    """
    candidate = _clean(value)
    if not candidate:
        return None
    try:
        phone_validator.validate_python(candidate)
    except Exception:
        return None
    return candidate


def _as_social_network(url: str) -> dict[str, str] | None:
    """Map a stored link onto a RenderCV social network, or give up.

    RenderCV only knows a closed list of networks and validates the username
    per network. A link that matches one of its base URLs becomes a proper
    header connection; anything else returns ``None`` and is typeset as a
    Links entry instead.
    """
    candidate = _clean(url)
    if not candidate:
        return None
    for network, base_url in url_dictionary.items():
        if not candidate.lower().startswith(base_url.lower()):
            continue
        username = candidate[len(base_url) :].strip('/').strip()
        if not username:
            return None
        try:
            SocialNetwork(network=network, username=username)
        except Exception:
            return None
        return {'network': network, 'username': username}
    return None


def _markdown_link(label: str, url: str) -> str:
    """A markdown hyperlink RenderCV turns into a Typst link.

    The label is typeset, so it is neutralized; the URL is a link *target*,
    which RenderCV handles itself and must not be rewritten.
    """
    text = _text(label) or _text(url)
    return f'[{text}]({_clean(url)})'


def _experience_entries(cv: RenderableCV) -> list[dict[str, Any]]:
    """applika's free-text ``period`` becomes RenderCV's arbitrary ``date``."""
    entries: list[dict[str, Any]] = []
    for item in cv.experience:
        entry: dict[str, Any] = {
            'company': _text(item.company),
            'position': _text(item.role),
        }
        if _text(item.period):
            entry['date'] = _text(item.period)
        if _text(item.location):
            entry['location'] = _text(item.location)
        if _text(item.company_description):
            entry['summary'] = _text(item.company_description)
        bullets = [_text(b) for b in item.bullets if _clean(b)]
        if bullets:
            entry['highlights'] = bullets
        entries.append(entry)
    return entries


def _project_entries(cv: RenderableCV) -> list[dict[str, Any]]:
    """The project link rides along in the summary as a markdown link."""
    entries: list[dict[str, Any]] = []
    for item in cv.projects:
        summary_parts = [_text(item.description)]
        if _clean(item.link):
            summary_parts.append(
                _markdown_link(item.link_label or '', item.link)
            )
        summary = ' '.join(part for part in summary_parts if part)
        entry: dict[str, Any] = {'name': _text(item.name)}
        if summary:
            entry['summary'] = summary
        entries.append(entry)
    return entries


def _one_line_entries(
    items: Any, label_attr: str, details_attr: str
) -> list[dict[str, str]]:
    """Build OneLineEntry dicts. ``Languages`` and nothing else.

    The vendored ``SectionEnding.j2.typ`` closes a ``)`` for *every*
    OneLineEntry section while ``SectionBeginning.j2.typ`` opens the grid only
    for ``languages``, so a second OneLineEntry section would print a stray
    bracket. :func:`_labelled_lines` is the shape every other pair-like section
    uses.
    """
    entries: list[dict[str, str]] = []
    for item in items:
        label = _text(getattr(item, label_attr))
        details = _text(getattr(item, details_attr))
        if not label and not details:
            continue
        entries.append({'label': label, 'details': details})
    return entries


def _labelled_line(label: str, details: str) -> str:
    """A ``label``/``details`` pair as one markdown TextEntry line."""
    if not label:
        return details
    if not details:
        return f'**{label}**'
    return f'**{label}** {details}'


def _labelled_lines(
    items: Any, label_attr: str, details_attr: str
) -> list[str]:
    """The same pairs as :func:`_one_line_entries`, as TextEntry lines."""
    lines: list[str] = []
    for item in items:
        label = _text(getattr(item, label_attr))
        details = _text(getattr(item, details_attr))
        if not label and not details:
            continue
        lines.append(_labelled_line(label, details))
    return lines


def _sections(cv: RenderableCV) -> dict[str, Any]:
    """Build the section map, dropping every section that has no content."""
    sections: dict[str, Any] = {}

    summary = _text(cv.summary)
    if summary:
        sections[SUMMARY_SECTION] = [summary]

    experience = _experience_entries(cv)
    if experience:
        sections[EXPERIENCE_SECTION] = experience

    projects = _project_entries(cv)
    if projects:
        sections[PROJECTS_SECTION] = projects

    skills = [_text(skill) for skill in cv.skills if _clean(skill)]
    if skills:
        sections[SKILLS_SECTION] = [SKILLS_SEPARATOR.join(skills)]

    certifications = _labelled_lines(cv.certifications, 'name', 'issuer')
    if certifications:
        sections[CERTIFICATIONS_SECTION] = certifications

    languages = _one_line_entries(cv.languages, 'name', 'level')
    if languages:
        sections[LANGUAGES_SECTION] = languages

    return sections


def map_cv_to_rendercv_document(cv: RenderableCV) -> dict[str, Any]:
    """Map a stored CV document onto a RenderCV input document.

    ``full_name`` is the person and becomes ``cv.name``; applika's ``name``
    column is the CV's own label and is never typeset (it only names the
    downloaded file).
    """
    cv_block: dict[str, Any] = {}

    full_name = _text(cv.full_name)
    if full_name:
        cv_block['name'] = full_name

    headline = _text(cv.headline)
    if headline:
        cv_block['headline'] = headline

    location = _text(cv.location)
    if location:
        cv_block['location'] = location

    email = _valid_email(cv.email)
    if email:
        cv_block['email'] = email

    phone = _valid_phone(cv.phone)
    if phone:
        cv_block['phone'] = phone

    social_networks: list[dict[str, str]] = []
    leftover_links: list[str] = []
    for link in cv.links:
        network = _as_social_network(link.url)
        if network is not None:
            social_networks.append(network)
            continue
        if _clean(link.url):
            leftover_links.append(
                _labelled_line(
                    _text(link.label) or _text(link.url),
                    _markdown_link(link.label, link.url),
                )
            )
    if social_networks:
        cv_block['social_networks'] = social_networks

    sections = _sections(cv)
    if leftover_links:
        sections[LINKS_SECTION] = leftover_links
    if sections:
        cv_block['sections'] = sections

    return {'cv': cv_block, 'design': {'theme': THEME_NAME}}


def map_cv_to_rendercv_yaml(cv: RenderableCV) -> str:
    """Serialize :func:`map_cv_to_rendercv_document` to the YAML RenderCV eats.

    ``ruamel.yaml`` rather than a new dependency: RenderCV already ships it and
    already parses its input with it, so what is written here is exactly what
    it reads back.
    """
    document = map_cv_to_rendercv_document(cv)
    serializer = ruamel.yaml.YAML(typ='safe', pure=True)
    serializer.default_flow_style = False
    buffer = StringIO()
    serializer.dump(document, buffer)
    return buffer.getvalue()
