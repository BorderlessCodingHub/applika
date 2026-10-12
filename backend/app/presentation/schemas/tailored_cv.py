"""Application CV copy request/response schemas (presentation layer).

The section item schemas are imported from ``schemas/base_cv.py`` rather than
redefined: a master CV and its copy are the same document shape, and the
client-generated sub-item ids travel through both unchanged.

``TailoredCVOut`` does not expose ``user_id``, exactly like ``BaseCVOut``:
every route is already scoped to the acting user, so the field would carry no
information on the wire. ``application_id``, ``base_cv_id`` and the copy's own
``id`` are Snowflakes serialized as strings
(docs/applika/adr/0003-snowflake-string-ids.md); ``base_cv_id`` is ``null``
once the master CV it came from has been deleted.
"""

from pydantic import Field

from app.application.dto.tailored_cv import TailoringMode
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema
from app.presentation.schemas.base_cv import (
    CertificationIn,
    EducationIn,
    ExperienceIn,
    LanguageIn,
    LinkIn,
    ProjectIn,
    SkillCategoryIn,
)


class TailoredCVCreate(BaseSchema):
    """Request body for creating an application's CV copy.

    The chosen master CV and, optionally, how to tailor it: ``user_id``
    comes from the acting user and ``application_id`` from the path.

    ``tailoring`` (ADR-0017) is ``'copy'`` - the verbatim copy - unless the
    client opts in to ``'keywords'``. A body without it, as every installed
    ``applika-cli`` sends, keeps getting the verbatim copy; any other value
    is a 422.
    """

    base_cv_id: SnowflakeID
    tailoring: TailoringMode = 'copy'


class TailoredCVUpdate(BaseSchema):
    """Full-replace body for a CV copy: every editable field, all at once.

    There is no partial update here and no sticky field - unlike the master
    CV's PATCH, this is a PUT and the client always sends the whole document.
    Provenance (``base_cv_id``, ``was_ai_generated``, ``adjustments``) and the
    diff baseline (``base_snapshot``, R5) are not accepted; ``extra='forbid'``
    turns an attempt to send any of them into a 422.
    """

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


class CVAdjustmentOut(BaseSchema):
    """One tailoring adjustment; only the keyword binding records any."""

    section: str
    description: str


class TailoredCVSnapshotOut(BaseSchema):
    """The master CV's content, frozen at copy-creation time (R5).

    Exactly the copy's own editable document shape - identity, contact,
    summary and the seven sections - so the web diff can compare it against
    the copy's current form values field for field. Read-only: there is no
    corresponding ``*In`` schema, because nothing ever writes this shape
    back through the API.
    """

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


class TailoredCVOut(BaseSchema, TimeSchema):
    id: SnowflakeID
    application_id: SnowflakeID
    base_cv_id: SnowflakeID | None = None
    was_ai_generated: bool = False
    adjustments: list[CVAdjustmentOut] = []
    # Written once, at creation, from the master CV (never the tailoring
    # result); ``null`` for a copy made before revision ``c1d9f4a7b3e6``
    # (no backfill) and never written by ``PUT`` - ``TailoredCVUpdate``
    # below carries no such field, and ``extra='forbid'`` turns an attempt
    # to send one into a 422.
    base_snapshot: TailoredCVSnapshotOut | None = None
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


class CVFit(BaseSchema):
    """The keyword fit of the CV copy for the application's job description.

    ``score`` is a whole number from 0 to 100, ``null`` (with both lists
    empty) when the application has no job description.
    """

    score: int | None
    matched_keywords: list[str]
    missing_keywords: list[str]
