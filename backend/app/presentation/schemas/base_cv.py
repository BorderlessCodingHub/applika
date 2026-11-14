"""Master CV request/response schemas (presentation layer).

``BaseCVCreate`` never accepts ``user_id``: the owning user is stamped from the
acting user (``extra='forbid'`` turns an attempt into a 422). ``BaseCVOut``
does not expose ``user_id`` either - every route is already scoped to the
acting user, so the field carries no information on the wire.

Section sub-item ``id``s are client-generated strings preserved round-trip; the
master CV's own ``id`` is a Snowflake serialized as a string
(docs/adr/0003-snowflake-string-ids.md).
"""

from typing import Self

from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.application.dto.base_cv import (
    CV_MONTH_PATTERN,
    NOT_NULLABLE_FIELDS,
    reject_finish_before_start,
)
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema

# --- Section item schemas ---


class _DatedIn(BaseSchema):
    """The wire half of a CV period: a required start, an optional finish.

    ISO ``YYYY-MM`` on the wire, in both directions. The owner asked for an
    ``MM/yyyy`` *input* ("it's a date input but only for month and year
    "MM/yyyy" for both start and finish"); that format is the frontend's, and
    the API speaks ISO because it is what the renderer's ``start_date`` /
    ``end_date`` take unchanged.

    An absent or ``null`` ``end`` means the entry is current and typesets as
    ``present``. The pattern and the ordering rule are imported from
    ``application/dto/base_cv.py`` rather than restated, so the wire and the
    use-case layer refuse exactly the same payloads.
    """

    start: str = Field(pattern=CV_MONTH_PATTERN)
    end: str | None = Field(default=None, pattern=CV_MONTH_PATTERN)

    @model_validator(mode='after')
    def _reject_finish_before_start(self) -> Self:
        """A finish earlier than its start is a 422, never a stored row."""
        reject_finish_before_start(self.start, self.end)
        return self


class LinkIn(BaseSchema):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=500)


class ExperienceIn(_DatedIn):
    """One experience entry; ``start`` is required, ``end`` means "until"."""

    id: str = Field(min_length=1)
    company: str = Field(min_length=1, max_length=200)
    company_description: str | None = Field(default=None, max_length=500)
    role: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    bullets: list[str] = []


class ProjectIn(BaseSchema):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=2000)
    link: str | None = Field(default=None, max_length=500)
    link_label: str | None = Field(default=None, max_length=100)


class SkillCategoryIn(BaseSchema):
    """One skill category and its keywords.

    The owner: a skills section is "a section where i can create a category
    and inside this caregory add keywords" - so the wire shape is a list of
    categories, never a flat list of strings. There is deliberately no
    ``list[str]`` fallback: the column that holds this has never existed on
    any database, so there is no stored shape to stay compatible with.
    """

    id: str = Field(min_length=1)
    category: str = Field(min_length=1, max_length=100)
    keywords: list[str] = []


class EducationIn(_DatedIn):
    """One education entry; ``start`` is required here too.

    The widening the owner asked for: education's period used to be optional
    free text, and is now the same required-start / optional-finish pair
    experience carries.
    """

    id: str = Field(min_length=1)
    institution: str = Field(min_length=1, max_length=200)
    degree: str = Field(min_length=1, max_length=200)
    area: str | None = Field(default=None, max_length=200)


class CertificationIn(BaseSchema):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    issuer: str = Field(min_length=1, max_length=200)


class LanguageIn(BaseSchema):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=100)
    level: str = Field(min_length=1, max_length=50)


# --- Aggregate request/response schemas ---


class BaseCVCreate(BaseSchema):
    """Request body for creating a master CV (``user_id`` is server-stamped)."""

    name: str = Field(min_length=1, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    headline: str = Field(min_length=1, max_length=300)
    location: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    summary: str = Field(default='', max_length=5000)
    links: list[LinkIn] = []
    skills: list[SkillCategoryIn] = []
    experience: list[ExperienceIn] = []
    projects: list[ProjectIn] = []
    education: list[EducationIn] = []
    certifications: list[CertificationIn] = []
    languages: list[LanguageIn] = []


class BaseCVUpdate(BaseSchema):
    """Partial-update body; only the fields provided are applied.

    A section provided replaces that section whole, client ids included.

    ``None`` here means *unset*, not *clear*. Every field except ``phone``
    maps to a NOT NULL column, so an explicitly sent ``null`` is rejected as a
    422 rather than travelling down to the database as one - the pinned
    contract for PATCH is ``200 | 404 | 422`` and nothing else. ``phone`` is
    the one nullable column, so ``{"phone": null}`` really does clear it.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    headline: str | None = Field(default=None, min_length=1, max_length=300)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    summary: str | None = Field(default=None, max_length=5000)
    links: list[LinkIn] | None = None
    skills: list[SkillCategoryIn] | None = None
    experience: list[ExperienceIn] | None = None
    projects: list[ProjectIn] | None = None
    education: list[EducationIn] | None = None
    certifications: list[CertificationIn] | None = None
    languages: list[LanguageIn] | None = None

    @field_validator(*NOT_NULLABLE_FIELDS, mode='before')
    @classmethod
    def _reject_explicit_null(cls, value: object, info: ValidationInfo):
        """Refuse a ``null`` that was actually sent for a NOT NULL column.

        Validators do not run for fields the request omitted, so this only
        fires on an explicit ``null`` and leaves partial updates untouched.
        """
        if value is None:
            raise ValueError(
                f'{info.field_name} cannot be null; '
                'omit the field to leave it unchanged'
            )
        return value


class BaseCVOut(BaseSchema, TimeSchema):
    id: SnowflakeID
    name: str
    full_name: str
    headline: str
    location: str
    email: str
    phone: str | None = None
    summary: str = ''
    links: list[LinkIn] = []
    skills: list[SkillCategoryIn] = []
    experience: list[ExperienceIn] = []
    projects: list[ProjectIn] = []
    education: list[EducationIn] = []
    certifications: list[CertificationIn] = []
    languages: list[LanguageIn] = []
