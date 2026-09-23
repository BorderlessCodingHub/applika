"""Pure CV diff: baseline vs current, field by field. No I/O, no framework.

KODI-017 T091 (R-024/R-025). This is the SERVER half of the "Diff design
(PINNED)" the ticket addendum shares with the web diff
(``frontend/src/components/tailored-cvs/cv-diff.ts``): the two implementations
are pinned to the same semantics and the same canonical JSON output, proven
equal by the shared fixtures under ``applika/fixtures/cv-diff/``
(:mod:`tests.unit.test_cv_diff_fixtures`).

Nothing here touches the database, HTTP or the clock - :func:`diff_cv` takes
two :class:`~app.application.dto.tailored_cv.TailoredCVContent` values and
returns a :class:`CVDiffResult`, deterministically.

**Matching.** List-section items are matched by their client-generated ``id``,
never by position (a pure reorder is not a change). An id in ``current`` only
is ``added``; an id in ``baseline`` only is ``removed``, carrying the whole
baseline item as ``before``; an id in both has every field but ``id``
compared.

**Normalisation.** ``None`` and ``""`` compare equal for every scalar field;
everything else is exact string equality. ``bullets`` compares as one whole
value (any difference is one "changed", not one per bullet). ``keywords``
compares as a *set* per skill category: each keyword present in only one side
is its own ``keyword_added``/``keyword_removed`` change.

**Sections and counts.** ``identity`` covers ``name``, ``full_name``,
``headline``, ``location``, ``email``, ``phone``; ``summary`` covers
``summary`` alone; each list section (``links``, ``skills``, ``experience``,
``projects``, ``education``, ``certifications``, ``languages``) is its own
section. Every changed scalar, changed item field, added item, removed item
and added/removed keyword counts as exactly one change; a section's count is
the sum of its own changes and ``total`` is the sum of every section - matched
by :mod:`tests.unit.test_cv_diff`.
"""

from pydantic import BaseModel, ConfigDict

from app.application.dto.base_cv import SkillCategoryItem
from app.application.dto.tailored_cv import TailoredCVContent

# --- Canonical section keys, in the exact order the PINNED JSON pins ------

IDENTITY_SECTION = 'identity'
LINKS_SECTION = 'links'
SUMMARY_SECTION = 'summary'
EXPERIENCE_SECTION = 'experience'
LANGUAGES_SECTION = 'languages'
SKILLS_SECTION = 'skills'
PROJECTS_SECTION = 'projects'
EDUCATION_SECTION = 'education'
CERTIFICATIONS_SECTION = 'certifications'

# The exact order and key set of the "sections" object in the PINNED
# canonical JSON, and the order the diff Markdown document lists them in
# after "Identity and contact" and "Links" (T091, "Diff Markdown document").
SECTION_ORDER: tuple[str, ...] = (
    IDENTITY_SECTION,
    LINKS_SECTION,
    SUMMARY_SECTION,
    EXPERIENCE_SECTION,
    LANGUAGES_SECTION,
    SKILLS_SECTION,
    PROJECTS_SECTION,
    EDUCATION_SECTION,
    CERTIFICATIONS_SECTION,
)

# The identity/contact scalar fields, in the order the PRD's PINNED text
# lists them: "identity = name, full_name, headline, location, email, phone."
IDENTITY_FIELDS: tuple[str, ...] = (
    'name',
    'full_name',
    'headline',
    'location',
    'email',
    'phone',
)

# Every list-section field compared item-by-item, ``id`` excluded. ``skills``
# is handled separately below (category is a field, keywords are set-diffed).
_SECTION_ITEM_FIELDS: dict[str, tuple[str, ...]] = {
    LINKS_SECTION: ('label', 'url'),
    EXPERIENCE_SECTION: (
        'company',
        'company_description',
        'role',
        'location',
        'start',
        'end',
        'bullets',
    ),
    PROJECTS_SECTION: ('name', 'description', 'link', 'link_label'),
    EDUCATION_SECTION: ('institution', 'degree', 'area', 'start', 'end'),
    CERTIFICATIONS_SECTION: ('name', 'issuer'),
    LANGUAGES_SECTION: ('name', 'level'),
}

# Whole-value (never per-element) fields within a list-section item: bullets
# is a list, and the PINNED text says "bullets compared as a whole list
# (one 'changed')".
_WHOLE_VALUE_FIELDS = frozenset({'bullets'})

CHANGED = 'changed'
ADDED = 'added'
REMOVED = 'removed'
KEYWORD_ADDED = 'keyword_added'
KEYWORD_REMOVED = 'keyword_removed'


class CVDiffChange(BaseModel):
    """One line of the diff, in the PINNED canonical shape."""

    model_config = ConfigDict(extra='forbid')

    kind: str
    section: str
    path: str
    before: object | None = None
    after: object | None = None


class CVDiffResult(BaseModel):
    """The whole diff: total, per-section counts, and the change list.

    ``sections`` always carries every one of the nine keys, even at 0 - the
    PINNED canonical JSON shows a fixed key set, not a sparse one.
    """

    model_config = ConfigDict(extra='forbid')

    total: int
    sections: dict[str, int]
    changes: list[CVDiffChange]

    def canonical(self) -> dict:
        """The PINNED canonical JSON, exactly as fixtures and the API return it."""
        return self.model_dump(mode='json')


def _norm(value: object | None) -> object:
    """``None`` and ``""`` are the same value for a scalar comparison."""
    return '' if value in (None, '') else value


def _scalar_equal(before: object | None, after: object | None) -> bool:
    return _norm(before) == _norm(after)


def _diff_identity_and_summary(
    baseline: TailoredCVContent, current: TailoredCVContent
) -> list[CVDiffChange]:
    changes: list[CVDiffChange] = []
    for field in IDENTITY_FIELDS:
        before = getattr(baseline, field)
        after = getattr(current, field)
        if not _scalar_equal(before, after):
            changes.append(
                CVDiffChange(
                    kind=CHANGED,
                    section=IDENTITY_SECTION,
                    path=field,
                    before=before,
                    after=after,
                )
            )
    if not _scalar_equal(baseline.summary, current.summary):
        changes.append(
            CVDiffChange(
                kind=CHANGED,
                section=SUMMARY_SECTION,
                path='summary',
                before=baseline.summary,
                after=current.summary,
            )
        )
    return changes


def _item_field_equal(section: str, field: str, before, after) -> bool:
    if field in _WHOLE_VALUE_FIELDS:
        return list(before or []) == list(after or [])
    return _scalar_equal(before, after)


def _diff_list_section(
    section: str, baseline_items: list, current_items: list
) -> list[CVDiffChange]:
    changes: list[CVDiffChange] = []
    baseline_by_id = {item.id: item for item in baseline_items}
    current_by_id = {item.id: item for item in current_items}

    for item in current_items:
        baseline_item = baseline_by_id.get(item.id)
        if baseline_item is None:
            changes.append(
                CVDiffChange(
                    kind=ADDED,
                    section=section,
                    path=f'{section}:{item.id}',
                    before=None,
                    after=item.model_dump(),
                )
            )
            continue

        fields = _SECTION_ITEM_FIELDS[section]
        for field in fields:
            before_value = getattr(baseline_item, field)
            after_value = getattr(item, field)
            if not _item_field_equal(section, field, before_value, after_value):
                changes.append(
                    CVDiffChange(
                        kind=CHANGED,
                        section=section,
                        path=f'{section}:{item.id}.{field}',
                        before=before_value,
                        after=after_value,
                    )
                )

    for item in baseline_items:
        if item.id not in current_by_id:
            changes.append(
                CVDiffChange(
                    kind=REMOVED,
                    section=section,
                    path=f'{section}:{item.id}',
                    before=item.model_dump(),
                    after=None,
                )
            )

    return changes


def _diff_skills(
    baseline_items: list[SkillCategoryItem],
    current_items: list[SkillCategoryItem],
) -> list[CVDiffChange]:
    changes: list[CVDiffChange] = []
    baseline_by_id = {item.id: item for item in baseline_items}
    current_by_id = {item.id: item for item in current_items}

    for item in current_items:
        baseline_item = baseline_by_id.get(item.id)
        if baseline_item is None:
            changes.append(
                CVDiffChange(
                    kind=ADDED,
                    section=SKILLS_SECTION,
                    path=f'{SKILLS_SECTION}:{item.id}',
                    before=None,
                    after=item.model_dump(),
                )
            )
            continue

        if not _scalar_equal(baseline_item.category, item.category):
            changes.append(
                CVDiffChange(
                    kind=CHANGED,
                    section=SKILLS_SECTION,
                    path=f'{SKILLS_SECTION}:{item.id}.category',
                    before=baseline_item.category,
                    after=item.category,
                )
            )

        baseline_keywords = set(baseline_item.keywords)
        current_keywords = set(item.keywords)
        for keyword in sorted(current_keywords - baseline_keywords):
            changes.append(
                CVDiffChange(
                    kind=KEYWORD_ADDED,
                    section=SKILLS_SECTION,
                    path=f'{SKILLS_SECTION}:{item.id}.keywords:{keyword}',
                    before=None,
                    after=keyword,
                )
            )
        for keyword in sorted(baseline_keywords - current_keywords):
            changes.append(
                CVDiffChange(
                    kind=KEYWORD_REMOVED,
                    section=SKILLS_SECTION,
                    path=f'{SKILLS_SECTION}:{item.id}.keywords:{keyword}',
                    before=keyword,
                    after=None,
                )
            )

    for item in baseline_items:
        if item.id not in current_by_id:
            changes.append(
                CVDiffChange(
                    kind=REMOVED,
                    section=SKILLS_SECTION,
                    path=f'{SKILLS_SECTION}:{item.id}',
                    before=item.model_dump(),
                    after=None,
                )
            )

    return changes


def diff_cv(
    baseline: TailoredCVContent, current: TailoredCVContent
) -> CVDiffResult:
    """Compare ``current`` against ``baseline`` field by field.

    Deterministic and framework-free: the same two documents always produce
    the same result, in the same order, which is what lets the shared
    fixtures pin the web and the server diff to one another.
    """
    changes: list[CVDiffChange] = []
    changes.extend(_diff_identity_and_summary(baseline, current))
    changes.extend(
        _diff_list_section(LINKS_SECTION, baseline.links, current.links)
    )
    changes.extend(_diff_skills(baseline.skills, current.skills))
    changes.extend(
        _diff_list_section(
            EXPERIENCE_SECTION, baseline.experience, current.experience
        )
    )
    changes.extend(
        _diff_list_section(
            PROJECTS_SECTION, baseline.projects, current.projects
        )
    )
    changes.extend(
        _diff_list_section(
            EDUCATION_SECTION, baseline.education, current.education
        )
    )
    changes.extend(
        _diff_list_section(
            CERTIFICATIONS_SECTION,
            baseline.certifications,
            current.certifications,
        )
    )
    changes.extend(
        _diff_list_section(
            LANGUAGES_SECTION, baseline.languages, current.languages
        )
    )

    sections = dict.fromkeys(SECTION_ORDER, 0)
    for change in changes:
        sections[change.section] += 1

    return CVDiffResult(total=len(changes), sections=sections, changes=changes)
