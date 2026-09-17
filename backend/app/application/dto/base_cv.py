"""Master CV data-transfer objects (application layer).

A master CV is a document aggregate: identity/contact scalars, a summary and
six repeatable sections that are read and written whole. The item models below
validate the JSONB shape by structure; every sub-item carries a
**client-generated** ``id`` string that is preserved round-trip and never
minted server-side.

``BaseCVCreateDTO`` is the transport-agnostic create input handed to the create
use case - ``user_id`` is stamped from the acting user, never read from the
request body. ``BaseCVUpdateDTO`` is an all-optional partial update applied via
``model_dump(exclude_unset=True)``. ``BaseCVDTO`` is the read model the use
cases return and the presentation layer maps to ``BaseCVOut``.
"""

from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationInfo,
    field_validator,
)

from app.application.dto import BaseSchema

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
    'certifications',
    'languages',
)

# --- Section item models (JSONB shape validation) ---


class _SectionItem(BaseModel):
    """Base for section items; unknown keys are rejected."""

    model_config = ConfigDict(extra='forbid', from_attributes=True)


class LinkItem(_SectionItem):
    """A profile link.

    Unlike the mynextjob prototype, applika's link carries a
    client-generated ``id`` like every other section item: the pinned API
    contract is ``links[{id, label, url}]``.
    """

    id: str
    label: str
    url: str


class ExperienceItem(_SectionItem):
    id: str
    company: str
    company_description: str | None = None
    role: str
    period: str
    location: str | None = None
    bullets: list[str] = []


class ProjectItem(_SectionItem):
    id: str
    name: str
    description: str
    link: str | None = None
    link_label: str | None = None


class CertificationItem(_SectionItem):
    id: str
    name: str
    issuer: str


class LanguageItem(_SectionItem):
    id: str
    name: str
    level: str


class BaseCVSections(BaseModel):
    """The six repeatable sections of a master CV, validated by shape.

    Each defaults to an empty list so an omitted section is stored as ``[]``
    and never NULL, mirroring ``BaseCVModel``'s ``server_default``.
    """

    model_config = ConfigDict(extra='forbid', from_attributes=True)

    links: list[LinkItem] = []
    skills: list[str] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
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
    skills: list[str] | None = None
    experience: list[ExperienceItem] | None = None
    projects: list[ProjectItem] | None = None
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
    skills: list[str] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    certifications: list[CertificationItem] = []
    languages: list[LanguageItem] = []
