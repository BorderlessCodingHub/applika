"""Application CV copy data-transfer objects (application layer).

A CV copy is a per-application document derived from a chosen master CV, at
most one per application. Unlike the mynextjob prototype it reads as reference,
applika's copy is a **full snapshot**: it carries the identity and contact
scalars as well as the summary and the seven sections, because the owner asked
for a copy that survives its master ("each job application will store a "copy"
of this master CV but edited to the job application"). Nothing is merged back
from the master at read time, so editing or deleting the master cannot change
the copy.

The section item models are reused from ``application/dto/base_cv.py`` rather
than redefined: the two documents share one shape by construction, and a
client-generated sub-item ``id`` is preserved round-trip here too.

``TailoringRequest`` and ``TailoringResult`` are the framework-free port DTOs.
``TailoredCVContent`` is the stored CV shape that AC11 pins: today's binding
fills it with a verbatim copy, and a real model can replace that binding later
without changing a single stored field.
"""

from pydantic import BaseModel, ConfigDict

from app.application.dto import BaseSchema
from app.application.dto.base_cv import (
    BaseCVDTO,
    BaseCVSections,
    CertificationItem,
    EducationItem,
    ExperienceItem,
    LanguageItem,
    LinkItem,
    ProjectItem,
    SkillCategoryItem,
)


class CVAdjustment(BaseModel):
    """One tailoring adjustment: which section changed and how.

    Always empty in this slice - the clone binding returns ``[]``. The shape
    exists so a future model-backed binding can explain what it changed
    without a migration.
    """

    model_config = ConfigDict(extra='forbid', from_attributes=True)

    section: str
    description: str


class TailoredCVContent(BaseCVSections):
    """The stored CV-copy body: identity, contact, summary and seven sections.

    This is the whole editable document. It deliberately includes the identity
    and contact scalars, which is what makes the copy a full snapshot rather
    than a view over its master.
    """

    name: str
    full_name: str
    headline: str
    location: str
    email: str
    phone: str | None = None
    summary: str = ''


class TailoringRequest(BaseModel):
    """Port input - framework-free, no HTTP and no provider imports.

    ``base_cv`` is the source document and ``job_description`` is the pasted
    posting the copy is being tailored to. ``profile_markdown`` is reserved
    for a future model-backed binding; the clone binding ignores both.
    """

    model_config = ConfigDict(extra='forbid')

    base_cv: BaseCVDTO
    job_description: str | None = None
    profile_markdown: str | None = None


class TailoringResult(BaseModel):
    """Port output - the tailored content plus its provenance."""

    model_config = ConfigDict(extra='forbid')

    content: TailoredCVContent
    adjustments: list[CVAdjustment] = []
    was_ai_generated: bool = False


class TailoredCVCreateDTO(BaseModel):
    """Transport-agnostic input for creating an application's CV copy.

    ``user_id`` is stamped from the acting user and ``application_id`` from
    the path; only ``base_cv_id`` comes from the request body.
    """

    model_config = ConfigDict(extra='forbid')

    user_id: int
    application_id: int
    base_cv_id: int


class TailoredCVUpdateDTO(TailoredCVContent):
    """Transport-agnostic full-replace payload for a CV copy's body.

    Carries every editable field and nothing else: ``application_id``,
    ``base_cv_id``, ``was_ai_generated`` and ``adjustments`` are provenance
    and are never touched by a manual edit.
    """


class TailoredCVDTO(BaseSchema):
    """Read model for a CV copy (``user_id`` stays out of the wire schema)."""

    user_id: int
    application_id: int
    base_cv_id: int | None = None
    was_ai_generated: bool = False
    adjustments: list[CVAdjustment] = []
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
