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

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema
from app.presentation.schemas.base_cv import (
    CertificationIn,
    ExperienceIn,
    LanguageIn,
    LinkIn,
    ProjectIn,
)


class TailoredCVCreate(BaseSchema):
    """Request body for creating an application's CV copy.

    The chosen master CV and nothing else: ``user_id`` comes from the acting
    user and ``application_id`` from the path.
    """

    base_cv_id: SnowflakeID


class TailoredCVUpdate(BaseSchema):
    """Full-replace body for a CV copy: every editable field, all at once.

    There is no partial update here and no sticky field - unlike the master
    CV's PATCH, this is a PUT and the client always sends the whole document.
    Provenance (``base_cv_id``, ``was_ai_generated``, ``adjustments``) is not
    accepted; ``extra='forbid'`` turns an attempt into a 422.
    """

    name: str = Field(min_length=1, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    headline: str = Field(min_length=1, max_length=300)
    location: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    summary: str = Field(default='', max_length=5000)
    links: list[LinkIn] = []
    skills: list[str] = []
    experience: list[ExperienceIn] = []
    projects: list[ProjectIn] = []
    certifications: list[CertificationIn] = []
    languages: list[LanguageIn] = []


class CVAdjustmentOut(BaseSchema):
    """One tailoring adjustment. Always absent in this slice."""

    section: str
    description: str


class TailoredCVOut(BaseSchema, TimeSchema):
    id: SnowflakeID
    application_id: SnowflakeID
    base_cv_id: SnowflakeID | None = None
    was_ai_generated: bool = False
    adjustments: list[CVAdjustmentOut] = []
    name: str
    full_name: str
    headline: str
    location: str
    email: str
    phone: str | None = None
    summary: str = ''
    links: list[LinkIn] = []
    skills: list[str] = []
    experience: list[ExperienceIn] = []
    projects: list[ProjectIn] = []
    certifications: list[CertificationIn] = []
    languages: list[LanguageIn] = []
