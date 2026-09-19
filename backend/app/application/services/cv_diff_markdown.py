"""Render a :class:`~app.application.services.cv_diff.CVDiffResult` as Markdown.

KODI-017 T091, "Diff Markdown document (backend)" (PINNED):

    deterministic; "# Changes to <copy name>", a line "Compared with
    <baseline label>: N changes", then one "## <Section> (n)" per section
    with changes, in the order Identity and contact, Links, Summary, then
    SECTION_ORDER; each change one bullet ("Changed Headline: <before> ->
    <after>", "Added experience: <role at company>", "Removed ...", "Added
    keyword ...", "Removed keyword ..."). Zero changes -> the header lines
    and "No changes."

The ticket pins the document's skeleton and one worked example per change
``kind`` (a scalar change, an added item, and the two keyword kinds). It does
not pin the exact wording for a *changed list-item field* (e.g. an
experience's ``role`` edited in place) or for education/links/etc. item
titles, so this module extends the same "<Verb> <label>: <before> -> <after>"
/ "<Verb> <section>: <item>" shape to every section, documented field by
field below, and is exercised end to end in
``tests/unit/test_cv_diff_markdown.py``.
"""

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
    SECTION_ORDER,
    SKILLS_SECTION,
    SUMMARY_SECTION,
    CVDiffChange,
    CVDiffResult,
)

# Section headings, exactly as the PINNED order names them ("Identity and
# contact, Links, Summary, then SECTION_ORDER").
_SECTION_TITLES: dict[str, str] = {
    IDENTITY_SECTION: 'Identity and contact',
    LINKS_SECTION: 'Links',
    SUMMARY_SECTION: 'Summary',
    EXPERIENCE_SECTION: 'Experience',
    LANGUAGES_SECTION: 'Languages',
    SKILLS_SECTION: 'Skills',
    PROJECTS_SECTION: 'Projects',
    EDUCATION_SECTION: 'Education',
    CERTIFICATIONS_SECTION: 'Certifications',
}

# The noun used in "Added <noun>: <title>" / "Removed <noun>: <title>",
# singular, lower case - matches the PINNED "Added experience: ...".
_SECTION_NOUN: dict[str, str] = {
    LINKS_SECTION: 'link',
    EXPERIENCE_SECTION: 'experience',
    SKILLS_SECTION: 'skill',
    PROJECTS_SECTION: 'project',
    EDUCATION_SECTION: 'education',
    CERTIFICATIONS_SECTION: 'certification',
    LANGUAGES_SECTION: 'language',
}

# Human label for a scalar (identity/summary) or list-item field, used as
# "Changed <label>: <before> -> <after>".
_FIELD_LABELS: dict[str, str] = {
    'name': 'Name',
    'full_name': 'Full name',
    'headline': 'Headline',
    'location': 'Location',
    'email': 'Email',
    'phone': 'Phone',
    'summary': 'Summary',
    'label': 'Label',
    'url': 'URL',
    'company': 'Company',
    'company_description': 'Company description',
    'role': 'Role',
    'start': 'Start',
    'end': 'End',
    'bullets': 'Bullets',
    'description': 'Description',
    'link': 'Link',
    'link_label': 'Link label',
    'institution': 'Institution',
    'degree': 'Degree',
    'area': 'Area',
    'issuer': 'Issuer',
    'level': 'Level',
    'category': 'Category',
}


def _item_title(section: str, item: dict) -> str:
    """The human title of a whole added/removed item, e.g. "<role> at <company>".

    Only the two sections the PINNED example does not spell out get a
    two-field title (matching "Added experience: <role at company>" for
    experience); every other section titles itself by its one obvious name
    field.
    """
    if section == LINKS_SECTION:
        return item.get('label') or item.get('url') or ''
    if section == SKILLS_SECTION:
        return item.get('category') or ''
    if section == EXPERIENCE_SECTION:
        return f'{item.get("role") or ""} at {item.get("company") or ""}'
    if section == PROJECTS_SECTION:
        return item.get('name') or ''
    if section == EDUCATION_SECTION:
        return f'{item.get("degree") or ""} at {item.get("institution") or ""}'
    if section == CERTIFICATIONS_SECTION:
        return item.get('name') or ''
    if section == LANGUAGES_SECTION:
        return item.get('name') or ''
    return ''


def _item_id_and_field(path: str) -> tuple[str, str]:
    """Split ``"<section>:<id>.<field>"`` into ``(id, field)``."""
    _, rest = path.split(':', 1)
    item_id, field = rest.split('.', 1)
    return item_id, field


def _inline(value: object) -> str:
    """Render a value on one line, so every change stays one bullet.

    A list (``bullets``) is joined with ``"; "`` rather than printed as a
    Python repr; any run of whitespace, newlines included, collapses to one
    space, so a multi-paragraph summary can neither spill out of its bullet
    nor start a line with ``#`` and pose as a section heading.
    """
    if value is None:
        return ''
    if isinstance(value, list):
        return '; '.join(_inline(item) for item in value)
    return ' '.join(str(value).split())


ItemIndex = dict[tuple[str, str], dict]


def _item_label(index: ItemIndex, section: str, item_id: str) -> str:
    """The title of the item a field/keyword change belongs to, if known."""
    item = index.get((section, item_id))
    return _inline(_item_title(section, item)) if item else ''


def _bullet_for_change(change: CVDiffChange, index: ItemIndex) -> str:
    before = _inline(change.before)
    after = _inline(change.after)
    if change.section in (IDENTITY_SECTION, SUMMARY_SECTION):
        label = _FIELD_LABELS.get(change.path, change.path)
        return f'Changed {label}: {before} -> {after}'

    noun = _SECTION_NOUN.get(change.section, change.section)

    if change.kind == ADDED:
        item = change.after if isinstance(change.after, dict) else {}
        return f'Added {noun}: {_inline(_item_title(change.section, item))}'
    if change.kind == REMOVED:
        item = change.before if isinstance(change.before, dict) else {}
        return f'Removed {noun}: {_inline(_item_title(change.section, item))}'

    item_id, _ = _item_id_and_field(change.path)
    owner = _item_label(index, change.section, item_id)
    # The keyword comes from the value, never from the path: a keyword may
    # itself contain ":" (``ISO:27001``).
    if change.kind == KEYWORD_ADDED:
        suffix = f' to {owner}' if owner else ''
        return f'Added keyword {after}{suffix}'
    if change.kind == KEYWORD_REMOVED:
        suffix = f' from {owner}' if owner else ''
        return f'Removed keyword {before}{suffix}'
    if change.kind == CHANGED:
        _, field = _item_id_and_field(change.path)
        label = _FIELD_LABELS.get(field, field)
        where = f' ({owner})' if owner else ''
        return f'Changed {noun} {label}{where}: {before} -> {after}'
    raise ValueError(  # pragma: no cover
        f'Unknown diff change kind: {change.kind!r}'
    )


def _index_items(current: TailoredCVContent | None) -> ItemIndex:
    """``(section, id) -> item`` over the current document's list sections."""
    index: ItemIndex = {}
    if current is None:
        return index
    for section in _SECTION_NOUN:
        for item in getattr(current, section):
            index[(section, item.id)] = item.model_dump()
    return index


def render_diff_markdown(
    copy_name: str,
    baseline_label: str,
    diff: CVDiffResult,
    current: TailoredCVContent | None = None,
) -> str:
    """The deterministic Markdown document T091 pins.

    Zero changes still prints the header lines, followed by "No changes."
    instead of any section. ``current`` (the saved copy) is only used to
    name the item a changed field or keyword belongs to - "Changed
    experience Role (Staff Engineer at Acme): ..." - since the canonical
    change carries the item id, not its title.
    """
    index = _index_items(current)
    lines = [
        f'# Changes to {_inline(copy_name)}',
        '',
        f'Compared with {_inline(baseline_label)}: {diff.total} changes',
        '',
    ]

    if diff.total == 0:
        lines.append('No changes.')
        return '\n'.join(lines).rstrip() + '\n'

    changes_by_section: dict[str, list[CVDiffChange]] = {
        section: [] for section in SECTION_ORDER
    }
    for change in diff.changes:
        changes_by_section[change.section].append(change)

    for section in SECTION_ORDER:
        section_changes = changes_by_section[section]
        if not section_changes:
            continue
        title = _SECTION_TITLES[section]
        lines.append(f'## {title} ({len(section_changes)})')
        for change in section_changes:
            lines.append(f'- {_bullet_for_change(change, index)}')
        lines.append('')

    return '\n'.join(lines).rstrip() + '\n'
