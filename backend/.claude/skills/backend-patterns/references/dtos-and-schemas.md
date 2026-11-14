# DTOs & Presentation Schemas Reference

## Table of Contents
- [DTO vs Schema: When to use which](#dto-vs-schema)
- [DTO Pattern](#dto-pattern)
- [Presentation Schema Pattern](#presentation-schema-pattern)
- [Base Classes](#base-classes)

## DTO vs Schema

This project has **two** Pydantic model layers. They look similar but serve different purposes:

| Aspect           | DTOs (`app/application/dto/`)              | Schemas (`app/presentation/schemas/`)       |
|------------------|--------------------------------------------|--------------------------------------------|
| Purpose          | Business logic data contracts              | API request/response serialization         |
| Used by          | Use cases, repositories                    | Route handlers                             |
| Layer            | Application                                | Presentation                               |
| Base class       | `BaseSchema` from `dto/__init__.py`        | `BaseSchema` from `schemas/__init__.py`    |

The route handler converts between them: it receives a presentation schema from the request, converts to a DTO for the use case, then converts the returned DTO back to a presentation schema for the response.

## DTO Pattern

File: `app/application/dto/<feature>.py`

### Base class (app/application/dto/__init__.py)

```python
from pydantic import BaseModel, ConfigDict

class BaseSchema(BaseModel):
    id: int
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(
        extra='forbid',
        from_attributes=True,       # enables SomeDTO.model_validate(orm_model)
        validate_assignment=True,
    )
```

### Create / Update DTOs

These inherit from plain `BaseModel` — no `id`, no timestamps. They represent incoming data.

```python
from pydantic import BaseModel, HttpUrl
from typing_extensions import Literal


class TagCreateDTO(BaseModel):
    name: str
    color: str = '#007bff'
    user_id: int


class TagUpdateDTO(BaseModel):
    name: str
    color: str
```

### Response DTOs

These inherit from the `BaseSchema` in `dto/__init__.py` — includes `id`, `created_at`, `updated_at` and has `from_attributes=True` so you can do `TagDTO.model_validate(orm_model)`.

```python
from app.application.dto import BaseSchema


class TagDTO(BaseSchema):
    name: str
    color: str
    user_id: int
```

### Nested DTOs

For computed/nested data, use plain `BaseModel` or `TypedDict`:

```python
class ApplicationLastStep(BaseModel):
    id: int
    name: str
    color: str
    date: date


class ApplicationDTO(BaseSchema):
    company: str
    role: str
    finalized_at: datetime | None = None
    finalized: bool
    # Derived from the timeline by ApplicationReadModel, not read from the
    # row: model_validate() leaves them at their defaults.
    last_step: ApplicationLastStep | None = None
    salary_offer: float | None = None
```

A field that is no longer a column but that installed `applika-cli`
versions still read keeps its place on the DTO and the schema with a default,
and is filled in by the read model (`use_cases/applications/read_model.py`)
with `dto.model_copy(update=...)`.

## Presentation Schema Pattern

File: `app/presentation/schemas/<feature>.py`

### Base classes (app/presentation/schemas/__init__.py)

```python
from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        from_attributes=True,
        validate_assignment=True,
        coerce_numbers_to_str=True,
    )


class DetailSchema(BaseModel):
    detail: str


class TimeSchema(BaseModel):
    created_at: datetime
    updated_at: datetime | None = None
```

Note: the presentation `BaseSchema` has `coerce_numbers_to_str=True` (the DTO one does not).

### Request schemas (what the API receives)

Inherit from presentation `BaseSchema`. No `id` or timestamps — those come from the server.

```python
from app.presentation.schemas import BaseSchema


class CreateTag(BaseSchema):
    name: str
    color: str = '#007bff'
```

### Response schemas (what the API returns)

Inherit from both `BaseSchema` and `TimeSchema` to include `id`, `created_at`, `updated_at`.

```python
from app.presentation.schemas import BaseSchema, TimeSchema


class Tag(BaseSchema, TimeSchema):
    id: int
    name: str
    color: str
    user_id: int
```

### Error response documentation

Use `DetailSchema` in route `responses` for documenting error cases:

```python
router = APIRouter(
    tags=['Tags'],
    responses={'403': {'model': DetailSchema}}
)

@router.post(
    '/tags',
    response_model=Tag,
    status_code=201,
    responses={'404': {'model': DetailSchema}},
)
```


## Cross-field rules (the timeline event write schema)

A body whose fields constrain each other validates them in
`@model_validator(mode='after')` passes, one concern each, raising
`ValueError` so FastAPI answers 422 before any I/O
(`presentation/schemas/timeline_event.py`):

- scheduling: `start_time` and `end_time` together, end after start;
- offer salary: all three salary fields on an offer, none elsewhere;
- interview type: only on an interview, defaulting to `unknown`.

A PUT that replaces the whole row sends the **full** body, so every
cross-field rule can be checked on every write. When other paths build the
same object without the schema (the compat layer), the rules also live in
the use case (`use_cases/timeline_events/rules.py`) and raise the domain
exception; the database CHECKs are the last line.

Money that maps to `NUMERIC(p, s)` is a `Decimal` with `ge=0`,
`max_digits=p`, `decimal_places=s` on the way in and a fixed-precision string
on the way out (`@field_serializer`), never a float.

## Enum input aliases

An enum value that was renamed but that installed clients still send is
accepted through the enum's `_missing_` classmethod (`SalaryPeriod`:
`annual` -> `annually`). Pydantic calls it, so every request field of that
enum type accepts the old value, while OpenAPI and every response only show
the new one. Do not add the old value as a member or an alias: it would be
advertised and could be returned.

## Deprecated routes

A route kept only for installed clients is `deprecated=True` on the router
and depends on `mark_deprecated` (`presentation/deprecation.py`), which makes
every answer, errors included, carry `Deprecation: @<unix-seconds>`
(RFC 9745). Its request and response schemas stay exactly as the published
client expects them (`presentation/schemas/application_step.py`).
