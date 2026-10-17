"""Master CV data-transfer objects (application layer).

A master CV is a document aggregate: identity/contact scalars, a summary and
seven repeatable sections that are read and written whole. The item models
below validate the JSONB shape by structure; every sub-item carries a
**client-generated** ``id`` string that is preserved round-trip and never
minted server-side.

``BaseCVCreateDTO`` is the transport-agnostic create input handed to the create
use case - ``user_id`` is stamped from the acting user, never read from the
request body. ``BaseCVUpdateDTO`` is an all-optional partial update applied via
``model_dump(exclude_unset=True)``. ``BaseCVDTO`` is the read model the use
cases return and the presentation layer maps to ``BaseCVOut``.
"""

from typing import Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.application.dto import BaseSchema

# --- CV period months (experience and education) ---

# One month of a CV period, stored and carried on the wire as ISO ``YYYY-MM``.
#
# The owner asked for an ``MM/yyyy`` **input**: "it's a date input but only for
# month and year "MM/yyyy" for both start and finish". ``MM/yyyy`` is therefore
# what the user types and reads, and it lives entirely in the frontend; what
# applika stores and what crosses the wire is ISO, because ISO is exactly what
# RenderCV's ``start_date``/``end_date`` accept. The owner's own pinned theme
# tokens - ``single_date: MONTH_IN_TWO_DIGITS/YEAR`` and ``date_range:
# START_DATE - END_DATE`` - then format it back to ``MM/yyyy`` on the page with
# no translation layer anywhere in between.
#
# Anchored at both ends and month-bounded: ``2026-00`` and ``2026-13`` are not
# months, and a ``YYYY-MM`` prefix of a longer string is not a match.
#
# Single source of truth: ``app/presentation/schemas/base_cv.py`` imports this
# pattern rather than repeating it.
CV_MONTH_PATTERN = r'^\d{4}-(0[1-9]|1[0-2])$'

# What a finish earlier than its start is refused with, in both layers.
FINISH_BEFORE_START_MESSAGE = (
    'end cannot be earlier than start; leave end empty for a current entry'
)


def reject_finish_before_start(start: str | None, end: str | None) -> None:
    """Raise when a period finishes before it starts.

    Both values are ISO ``YYYY-MM`` by the time this runs, and ISO months sort
    lexicographically exactly as they sort chronologically, so a plain string
    comparison is the whole check - no parsing, no timezone, no ``date``.

    An absent ``end`` is a *current* entry and is never out of order.
    """
    if start and end and end < start:
        raise ValueError(FINISH_BEFORE_START_MESSAGE)


# The fields backed by a NOT NULL column: an explicit ``None`` on any of
# them is a caller error, not a request to clear the column. ``phone`` is
# deliberately absent - it is the one nullable column.
#
# Single source of truth: ``app/presentation/schemas/base_cv.py`` imports this
# tuple rather than repeating it, so a change to a column's nullability is
# edited in one place and both guards move together.
NOT_NULLABLE_FIELDS = (
    'name',
    'full_name',
    'headline',
    'location',
    'email',
    'summary',
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

# --- Section item models (JSONB shape validation) ---


class _SectionItem(BaseModel):
    """Base for section items; unknown keys are rejected."""

    model_config = ConfigDict(extra='forbid', from_attributes=True)


class _DatedSectionItem(_SectionItem):
    """A section item that runs from a month to an optional later month.

    The owner: "Today for Education and Experience, the period input is
    optional, this must be required, and needs to change, instead of a bare
    text input it needs to ask when started and when finished (finish is
    optional, when empty is counted as Present)".

    So ``start`` is **required** on both experience and education - education's
    single free-text ``period`` used to be optional, and this widens it - while
    ``end`` is optional and an absent ``end`` means the entry is current. The
    PDF prints that as ``present``, and it prints it because RenderCV's own
    model validator fills ``end_date`` in when only ``start_date`` is given;
    the mapper never synthesizes the word.
    """

    start: str = Field(pattern=CV_MONTH_PATTERN)
    end: str | None = Field(default=None, pattern=CV_MONTH_PATTERN)

    @model_validator(mode='after')
    def _reject_finish_before_start(self) -> Self:
        """Refuse a finish earlier than its start, wherever the item came from.

        On the *item* and not on the request schema on purpose: the same model
        backs a create, a partial update and the tailored-CV copy, so putting
        the rule here is what makes all three refuse the same payload.
        """
        reject_finish_before_start(self.start, self.end)
        return self


class LinkItem(_SectionItem):
    """A profile link.

    The link carries a
    client-generated ``id`` like every other section item: the pinned API
    contract is ``links[{id, label, url}]``.
    """

    id: str
    label: str
    url: str


class ExperienceItem(_DatedSectionItem):
    """One experience entry, from a required ``start`` month onwards.

    ``end`` is optional: an entry with none is the job the user holds today
    and typesets as ``present``.
    """

    id: str
    company: str
    company_description: str | None = None
    role: str
    location: str | None = None
    bullets: list[str] = []


class ProjectItem(_SectionItem):
    id: str
    name: str
    description: str
    link: str | None = None
    link_label: str | None = None


class SkillCategoryItem(_SectionItem):
    """One named skill category and the keywords inside it.

    The owner: "skills isn't simply a section where i put "tags" or just
    "keywords" it's a section where i can create a category and inside this
    caregory add keywords". So a skill is not a string - it is a category with
    its own keyword list, and the PDF prints one bold category line per entry
    with its keywords beneath.

    ``keywords`` may be empty: a category the user has created but not filled
    in yet still round-trips, and the renderer prints its heading alone.
    """

    id: str
    category: str
    keywords: list[str] = []


class EducationItem(_DatedSectionItem):
    """One education entry, from a required ``start`` month onwards.

    The period carries the same required ``start`` / optional ``end`` as
    :class:`ExperienceItem` - the owner asked for both sections to change
    together - and an entry with no ``end`` is a course still running, which
    typesets as ``present``. ``area`` stays optional because a degree does not
    always name one.
    """

    id: str
    institution: str
    degree: str
    area: str | None = None


class CertificationItem(_SectionItem):
    id: str
    name: str
    issuer: str


class LanguageItem(_SectionItem):
    id: str
    name: str
    level: str


class BaseCVSections(BaseModel):
    """The seven repeatable sections of a master CV, validated by shape.

    Each defaults to an empty list so an omitted section is stored as ``[]``
    and never NULL, mirroring ``BaseCVModel``'s ``server_default``.
    """

    model_config = ConfigDict(extra='forbid', from_attributes=True)

    links: list[LinkItem] = []
    skills: list[SkillCategoryItem] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    education: list[EducationItem] = []
    certifications: list[CertificationItem] = []
    languages: list[LanguageItem] = []


class BaseCVCreateDTO(BaseCVSections):
    """Normalized input for creating a master CV.

    Adds the identity/contact scalars and the ``user_id`` stamped from the
    acting user (never the request body).
    """

    user_id: int
    name: str
    full_name: str
    headline: str
    location: str
    email: str
    phone: str | None = None
    summary: str = ''


class BaseCVUpdateDTO(BaseModel):
    """Transport-agnostic partial-update payload for a master CV.

    Every field is optional; only the fields explicitly set are applied. The
    use case keys off ``model_dump(exclude_unset=True)`` so an unset field is
    never touched, and a section explicitly provided replaces that section
    whole.

    ``None`` means *unset*, not *clear*. Only ``phone`` maps to a nullable
    column, so an explicit ``None`` on any other field is rejected here rather
    than reaching the database as a NOT NULL violation. The presentation
    schema rejects it first and turns it into a 422; this guard covers any
    other caller of the use case.
    """

    model_config = ConfigDict(extra='forbid', from_attributes=True)

    name: str | None = None
    full_name: str | None = None
    headline: str | None = None
    location: str | None = None
    email: str | None = None
    phone: str | None = None
    summary: str | None = None
    links: list[LinkItem] | None = None
    skills: list[SkillCategoryItem] | None = None
    experience: list[ExperienceItem] | None = None
    projects: list[ProjectItem] | None = None
    education: list[EducationItem] | None = None
    certifications: list[CertificationItem] | None = None
    languages: list[LanguageItem] | None = None

    @field_validator(*NOT_NULLABLE_FIELDS, mode='before')
    @classmethod
    def _reject_explicit_null(cls, value: object, info: ValidationInfo):
        if value is None:
            raise ValueError(f'{info.field_name} cannot be null')
        return value


class BaseCVDTO(BaseSchema):
    """Read model for a master CV (``user_id`` stays out of the wire schema)."""

    user_id: int
    name: str
    full_name: str
    headline: str
    location: str
    email: str
    phone: str | None = None
    summary: str = ''
    links: list[LinkItem] = []
    skills: list[SkillCategoryItem] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    education: list[EducationItem] = []
    certifications: list[CertificationItem] = []
    languages: list[LanguageItem] = []
