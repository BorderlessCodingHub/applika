import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.application.dto.application import (
    ApplicationCompanyInputDTO,
    ApplicationCreateDTO,
    ApplicationUpdateDTO,
    FinalizeOutcomeDTO,
)
from app.application.use_cases.applications.create_application import (
    CreateApplicationUseCase,
)
from app.application.use_cases.applications.delete_application import (
    DeleteApplicationUseCase,
)
from app.application.use_cases.applications.finalize_application import (
    FinalizeApplicationUseCase,
    FinalizeApplicationWithOutcomeUseCase,
)
from app.application.use_cases.applications.list_applications import (
    ListApplicationsUseCase,
)
from app.application.use_cases.applications.reopen_application import (
    ReopenApplicationUseCase,
)
from app.application.use_cases.applications.update_application import (
    UpdateApplicationUseCase,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    ApplicationReadModelDp,
    ApplicationRepositoryDp,
    CompanyRepositoryDp,
    CurrentUserDp,
    PlatformRepositoryDp,
    TimelineEventRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application import (
    Application,
    CreateApplication,
    FinalizeWithOutcome,
    UpdateApplication,
)

router = APIRouter(
    tags=['Applications'], responses={'403': {'model': DetailSchema}}
)

# The one update field whose *absence* is meaningful. Everything else on
# UpdateApplication is a full replace, so a plain model_dump() is exactly
# right for it.
STICKY_UPDATE_FIELDS = ('job_description',)


def _build_update_dto(
    payload: UpdateApplication,
    user_id: int,
) -> ApplicationUpdateDTO:
    """Map the update body to its DTO, carrying set-ness for sticky fields.

    ``payload.model_dump()`` emits every key, defaults included, so the DTO
    built from it would claim the client sent ``job_description`` even when it
    did not - and an ``applika-cli`` 0.1.4 PUT, which has never heard of the
    field, would silently wipe the stored job description.

    Dropping the key when it is absent from ``payload.model_fields_set`` is
    what keeps that from happening: the DTO's own ``model_fields_set`` then
    mirrors what the client actually sent, and
    ``UpdateApplicationUseCase`` applies the field only when it is there.
    Every other optional field is still passed through with its dumped value,
    so an omitted ``observation`` keeps clearing the stored observation
    exactly as before.
    """
    company: int | ApplicationCompanyInputDTO = (
        payload.company
        if isinstance(payload.company, int)
        else ApplicationCompanyInputDTO(**payload.company.model_dump())
    )
    dumped = payload.model_dump(exclude={'company'})
    for field in STICKY_UPDATE_FIELDS:
        if field not in payload.model_fields_set:
            dumped.pop(field, None)
    return ApplicationUpdateDTO(
        **dumped,
        company=company,
        user_id=user_id,
    )


@router.post(
    '/applications',
    response_model=Application,
    status_code=201,
    responses={'404': {'model': DetailSchema}},
)
async def create(
    payload: CreateApplication,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
    company_repo: CompanyRepositoryDp,
):
    use_case = CreateApplicationUseCase(app_repo, platform_repo, company_repo)
    company = (
        payload.company
        if isinstance(payload.company, int)
        else payload.company.model_dump()
    )
    data = ApplicationCreateDTO(
        **payload.model_dump(exclude={'company'}),
        company=company,
        user_id=c_user.id,
    )
    application = await use_case.execute(data)
    return Application.model_validate(application)


@router.get('/applications', response_model=list[Application])
async def list_applications(
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    read_model: ApplicationReadModelDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = ListApplicationsUseCase(app_repo, read_model)
    applications = await use_case.execute(
        c_user.id,
        cycle_id=int(cycle_id) if cycle_id else None,
    )
    return applications


@router.put(
    '/applications/{application_id}',
    response_model=Application,
    responses={'404': {'model': DetailSchema}},
)
async def update_application(
    application_id: SnowflakeID,
    payload: UpdateApplication,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
    company_repo: CompanyRepositoryDp,
    read_model: ApplicationReadModelDp,
):
    use_case = UpdateApplicationUseCase(
        app_repo, platform_repo, company_repo, read_model
    )
    application = await use_case.execute(
        application_id, _build_update_dto(payload, c_user.id)
    )
    return Application.model_validate(application)


@router.delete(
    '/applications/{application_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_application(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
):
    use_case = DeleteApplicationUseCase(app_repo)
    await use_case.execute(application_id, c_user.id)


def _finalize_body(raw: bytes) -> dict[str, Any] | None:
    """The finalize body, or ``None`` when there is no body.

    No body, an empty body, ``null`` and ``{}`` all mean "close it". Any
    other object is the outcome body (``FinalizeWithOutcome``).
    """
    if not raw.strip():
        return None
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RequestValidationError([
            {
                'type': 'json_invalid',
                'loc': ('body', error.pos),
                'msg': 'JSON decode error',
                'input': {},
                'ctx': {'error': error.msg},
            }
        ]) from error
    if body is None or body == {}:
        return None
    if not isinstance(body, dict):
        raise RequestValidationError([
            {
                'type': 'model_attributes_type',
                'loc': ('body',),
                'msg': 'Input should be a valid dictionary or object',
                'input': body,
            }
        ])
    return body


def _schema_ref_to_components(node: Any) -> None:
    """Rewrite every ``$ref: '#/$defs/X'`` to ``#/components/schemas/X'``,
    in place, recursively.

    A raw ``model_json_schema()`` keeps its ``$defs`` local to itself; once
    that schema is inlined in the OpenAPI document (see
    ``_OUTCOME_BODY_SCHEMA`` below), a bare ``#/$defs/...`` ref would
    resolve against the root of the document instead, which has no
    ``$defs`` of its own. ``Currency`` and ``SalaryPeriod`` are already
    registered under ``components/schemas`` (every other schema that uses
    them puts them there), so pointing there is both correct and exactly
    how FastAPI resolves nested model refs everywhere else in this API.
    """
    if isinstance(node, dict):
        ref = node.get('$ref')
        if isinstance(ref, str) and ref.startswith('#/$defs/'):
            node['$ref'] = ref.replace('#/$defs/', '#/components/schemas/')
        for value in node.values():
            _schema_ref_to_components(value)
    elif isinstance(node, list):
        for item in node:
            _schema_ref_to_components(item)


def _outcome_body_schema() -> dict[str, Any]:
    """The optional outcome body (R-032), for the OpenAPI document: the
    route reads its body itself, so FastAPI cannot describe it."""
    outcome_schema = FinalizeWithOutcome.model_json_schema()
    outcome_schema.pop('$defs', None)
    _schema_ref_to_components(outcome_schema)
    return outcome_schema


_OUTCOME_BODY_SCHEMA = _outcome_body_schema()


@router.post(
    '/applications/{application_id}/finalize',
    response_model=Application,
    status_code=200,
    responses={
        '404': {'model': DetailSchema},
        '409': {
            'model': DetailSchema,
            'description': 'With an outcome and already closed',
        },
        '422': {
            'description': 'Archived in a cycle; an invalid outcome, a '
            'missing salary field on an offer outcome, a salary field '
            'without an offer outcome, event_date/observation without an '
            'outcome, a future event_date, or any other key (the retired '
            '0.1.4 body with step_id and feedback_id included)'
        },
    },
    openapi_extra={
        'requestBody': {
            'required': False,
            'description': 'Optional. Send no body, `{}` or `null` to '
            'close with no outcome (200, idempotent). Send '
            '`{outcome?: "offer"|"denied", event_date?, observation?, '
            'salary_amount?, salary_currency?, salary_period?, '
            'denied_reason?}` to close with an outcome event (200; R-032).',
            'content': {'application/json': {'schema': _OUTCOME_BODY_SCHEMA}},
        }
    },
)
async def finalize_application(
    application_id: SnowflakeID,
    request: Request,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    read_model: ApplicationReadModelDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Close the application (R-007). Reversible with ``/reopen``.

    No body/``{}``/``null`` is the plain close (200, idempotent, no
    outcome). Any other body is the optional outcome shape (R-032): 200, an
    ``offer``/``denied`` timeline event and ``finalized_at`` written
    atomically; a body with no outcome and no other field is the same
    idempotent close as no body at all. Any other key is a 422 GEN-1003
    (``FinalizeWithOutcome`` forbids extras): the retired 0.1.4 body
    (``step_id``, ``feedback_id``) closes nothing.
    """
    body = _finalize_body(await request.body())
    if body is None:
        use_case = FinalizeApplicationUseCase(app_repo, read_model)
        application = await use_case.execute(application_id, c_user.id)
        return Application.model_validate(application)

    try:
        outcome_payload = FinalizeWithOutcome.model_validate(body)
    except ValidationError as error:
        raise RequestValidationError([
            {**detail, 'loc': ('body', *detail['loc'])}
            for detail in error.errors(include_url=False)
        ]) from error

    if outcome_payload.outcome is None:
        # Every field is absent/null (schema validation refuses any other
        # combination without an outcome): the same idempotent close as no
        # body at all.
        use_case = FinalizeApplicationUseCase(app_repo, read_model)
        application = await use_case.execute(application_id, c_user.id)
        return Application.model_validate(application)

    outcome_use_case = FinalizeApplicationWithOutcomeUseCase(
        app_repo, timeline_repo, read_model
    )
    application = await outcome_use_case.execute(
        application_id,
        c_user.id,
        FinalizeOutcomeDTO(**outcome_payload.model_dump()),
    )
    return Application.model_validate(application)


@router.post(
    '/applications/{application_id}/reopen',
    response_model=Application,
    responses={
        '404': {'model': DetailSchema},
        '422': {'model': DetailSchema, 'description': 'Archived in a cycle'},
    },
)
async def reopen_application(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    read_model: ApplicationReadModelDp,
):
    """Reopen a closed application so its timeline is editable again
    (R-008). Reopening an open application is a no-op (R-009)."""
    use_case = ReopenApplicationUseCase(app_repo, read_model)
    application = await use_case.execute(application_id, c_user.id)
    return Application.model_validate(application)
