"""Vendored CV document schemas (KODI-018).

Standalone copies of the backend's ``BaseCVCreate`` / ``BaseCVUpdate`` /
``TailoredCVUpdate`` constraints
(``applika/backend/app/presentation/schemas/base_cv.py`` and
``.../tailored_cv.py``) - nothing is imported from the backend, exactly like
every other module under ``schemas/``.

The CLI validates a ``--file`` document *locally* before anything is sent, so
a typo costs no round trip and the user gets the failing field name instead of
a 422 body. ``extra='forbid'`` mirrors the API's own ``extra='forbid'``.

Every field is optional here because the same model validates a *create*
document and a *partial edit* document; the create-only requirements are
enforced afterwards by :func:`missing_create_fields`.
"""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

CV_MONTH_PATTERN = r'^\d{4}-(0[1-9]|1[0-2])$'

#: Keys the API returns but never accepts on input. They are accepted and
#: silently dropped by ``--file`` so that the spec's "Round trip" convention
#: works: ``get --output json|yaml`` > edit the file > ``edit --file``.
#: ``base_snapshot``/``adjustments``/``was_ai_generated``/``base_cv_id``/
#: ``application_id`` are the CV copy's provenance, which ``PUT`` forbids.
READ_ONLY_KEYS = frozenset({
    'id',
    'created_at',
    'updated_at',
    'application_id',
    'base_cv_id',
    'was_ai_generated',
    'adjustments',
    'base_snapshot',
})

#: The document's own editable keys, in the order the API declares them.
DOCUMENT_KEYS: tuple[str, ...] = (
    'name',
    'full_name',
    'headline',
    'location',
    'email',
    'phone',
    'summary',
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

#: The seven list sections, i.e. the keys whose items carry a client ``id``.
SECTION_KEYS: tuple[str, ...] = (
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

#: Fields the API requires on ``POST /base-cvs`` (and which a CV copy always
#: carries). ``name`` may come from ``--name`` instead of the file.
CREATE_REQUIRED_FIELDS: tuple[str, ...] = (
    'name',
    'full_name',
    'headline',
    'location',
    'email',
)

#: Every field except ``phone`` maps to a NOT NULL column: the API's PATCH
#: answers 422 for an explicit ``null``, so the CLI refuses it locally.
NOT_NULLABLE_FIELDS: tuple[str, ...] = tuple(
    key for key in DOCUMENT_KEYS if key != 'phone'
)


def new_item_id() -> str:
    """A client-generated id for a section item the file did not give one.

    The web diff matches section items by this id, so an item that arrives
    without one would look like a delete plus an insert on every edit.
    """
    return uuid.uuid4().hex


class CVItem(BaseModel):
    model_config = ConfigDict(extra='forbid')

    id: str | None = Field(default=None, min_length=1)


class _Dated(CVItem):
    start: str = Field(pattern=CV_MONTH_PATTERN)
    end: str | None = Field(default=None, pattern=CV_MONTH_PATTERN)

    @model_validator(mode='after')
    def _reject_finish_before_start(self) -> '_Dated':
        if self.end is not None and self.end < self.start:
            raise ValueError(
                f'end ({self.end}) is earlier than start ({self.start})'
            )
        return self


class LinkItem(CVItem):
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=500)


class SkillCategoryItem(CVItem):
    category: str = Field(min_length=1, max_length=100)
    keywords: list[str] = []


class ExperienceItem(_Dated):
    company: str = Field(min_length=1, max_length=200)
    company_description: str | None = Field(default=None, max_length=500)
    role: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    bullets: list[str] = []


class ProjectItem(CVItem):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=2000)
    link: str | None = Field(default=None, max_length=500)
    link_label: str | None = Field(default=None, max_length=100)


class EducationItem(_Dated):
    institution: str = Field(min_length=1, max_length=200)
    degree: str = Field(min_length=1, max_length=200)
    area: str | None = Field(default=None, max_length=200)


class CertificationItem(CVItem):
    name: str = Field(min_length=1, max_length=200)
    issuer: str = Field(min_length=1, max_length=200)


class LanguageItem(CVItem):
    name: str = Field(min_length=1, max_length=100)
    level: str = Field(min_length=1, max_length=50)


class CVDocument(BaseModel):
    """A ``--file`` CV document: every key optional, unknown keys refused.

    Used for both create and edit; ``model_dump(exclude_unset=True)`` gives
    exactly the keys the file carried, which is what "a section present
    replaces that whole section, an absent key is left unchanged" needs.
    """

    model_config = ConfigDict(extra='forbid')

    name: str | None = Field(default=None, min_length=1, max_length=200)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    headline: str | None = Field(default=None, min_length=1, max_length=300)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    summary: str | None = Field(default=None, max_length=5000)
    links: list[LinkItem] | None = None
    skills: list[SkillCategoryItem] | None = None
    experience: list[ExperienceItem] | None = None
    projects: list[ProjectItem] | None = None
    education: list[EducationItem] | None = None
    certifications: list[CertificationItem] | None = None
    languages: list[LanguageItem] | None = None


def missing_create_fields(document: dict[str, Any]) -> list[str]:
    """The ``POST /base-cvs`` required fields the document does not carry."""
    return [
        field
        for field in CREATE_REQUIRED_FIELDS
        if document.get(field) in (None, '')
    ]


def assign_item_ids(document: dict[str, Any]) -> dict[str, Any]:
    """Give every section item an ``id``, keeping the ones already there."""
    for section in SECTION_KEYS:
        items = document.get(section)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and not item.get('id'):
                item['id'] = new_item_id()
    return document
