"""What the tool modules share: the input base, partial inputs built from
the REST request schemas, and the read model built as
``presentation/dependencies.py`` builds it."""

import copy
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, create_model
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)
from app.lib.types import SnowflakeID


class ToolInput(BaseModel):
    """A tool's arguments: unknown keys are refused, as on REST."""

    model_config = ConfigDict(extra='forbid')


class NoInput(ToolInput):
    pass


class ApplicationRef(ToolInput):
    application_id: SnowflakeID


def partial_model(
    name: str,
    model: type[BaseModel],
    extra: dict[str, Any],
) -> type[BaseModel]:
    """``model``'s fields, each optional (default ``None``) with its own
    constraints, plus ``extra`` (``{name: (annotation, default)}``). What
    the caller sends is ``model_fields_set``; the merged result is then
    validated by ``model`` itself, the REST schema."""
    fields: dict[str, Any] = dict(extra)
    for field_name, info in model.model_fields.items():
        optional = copy.copy(info)
        optional.default = None
        optional.annotation = info.annotation | None
        fields[field_name] = (optional.annotation, optional)
    return create_model(name, __base__=ToolInput, **fields)


def read_model(session: AsyncSession) -> ApplicationReadModel:
    return ApplicationReadModel(TimelineEventRepository(session))


# --- CV documents ---------------------------------------------------------------

# The CV sections whose items carry an ``id`` (the web diff matches items by
# it). A missing one is assigned, as applika-cli's ``assign_item_ids`` did.
CV_SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)


def assign_item_ids(arguments: dict[str, Any]) -> dict[str, Any]:
    for section in CV_SECTIONS:
        items = arguments.get(section)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and not item.get('id'):
                item['id'] = uuid.uuid4().hex
    return arguments


def item_ids_optional(schema: dict[str, Any]) -> dict[str, Any]:
    """The published input schema: a section item may leave out ``id``."""
    for definition in schema.get('$defs', {}).values():
        required = definition.get('required')
        if isinstance(required, list) and 'id' in required:
            definition['required'] = [name for name in required if name != 'id']
    return schema
