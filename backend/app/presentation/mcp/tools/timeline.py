"""Timeline tools (applika-cli ``applications timeline|add-event|edit-event|
delete-event``), over the use cases ``presentation/api/timeline_event.py``
runs.

``add_timeline_event`` with an ``offer`` or ``denied`` event and no
``keep_open`` closes the application with that outcome in one write, as
the CLI did (it called the finalize route). ``edit_timeline_event`` merges
what is sent onto the stored event, as the CLI did: fields that do not
apply to the resulting type are dropped.
"""

from typing import Any

from app.application.dto.application import FinalizeOutcomeDTO
from app.application.dto.timeline_event import (
    CreateTimelineEventDTO,
    UpdateTimelineEventDTO,
)
from app.application.use_cases.applications.finalize_application import (
    FinalizeApplicationWithOutcomeUseCase,
)
from app.application.use_cases.applications.guards import ensure_mutable
from app.application.use_cases.timeline_events.create import (
    CreateTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.delete import (
    DeleteTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.list import (
    APPLICATION_NOT_FOUND,
    EVENT_NOT_FOUND,
    ListTimelineEventsUseCase,
)
from app.application.use_cases.timeline_events.update import (
    UpdateTimelineEventUseCase,
)
from app.core.enums import EventType
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.core.mcp_scopes import McpScope
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)
from app.lib.types import SnowflakeID
from app.presentation.mcp.registry import (
    DELETED_OUTPUT,
    McpTool,
    ToolContext,
    any_of_output,
    deleted,
    list_output,
    object_output,
)
from app.presentation.mcp.tools.common import (
    ApplicationRef,
    ToolInput,
    partial_model,
    read_model,
)
from app.presentation.schemas.application import (
    Application,
    FinalizeWithOutcome,
)
from app.presentation.schemas.timeline_event import (
    TimelineEventCreate,
    TimelineEventOut,
    TimelineEventUpdate,
)

# Which stored fields survive an edit, by the event's resulting type.
_INTERVIEW_ONLY = ('interview_type', 'start_time', 'end_time', 'timezone')
_OFFER_ONLY = ('salary_amount', 'salary_currency', 'salary_period')
_DENIED_ONLY = ('denied_reason',)


class AddTimelineEventIn(TimelineEventCreate):
    application_id: SnowflakeID
    # An offer or denied event closes the application unless this is true.
    keep_open: bool = False


EditTimelineEventIn = partial_model(
    'EditTimelineEventIn',
    TimelineEventUpdate,
    {
        'application_id': (SnowflakeID, ...),
        'event_id': (SnowflakeID, ...),
    },
)


class EventRef(ToolInput):
    application_id: SnowflakeID
    event_id: SnowflakeID


async def list_timeline(
    ctx: ToolContext, args: ApplicationRef
) -> list[TimelineEventOut]:
    use_case = ListTimelineEventsUseCase(
        ApplicationRepository(ctx.session),
        TimelineEventRepository(ctx.session),
    )
    events = await use_case.execute(args.application_id, ctx.user_id)
    return [TimelineEventOut.model_validate(event) for event in events]


async def add_timeline_event(
    ctx: ToolContext, args: AddTimelineEventIn
) -> TimelineEventOut | Application:
    app_repo = ApplicationRepository(ctx.session)
    timeline_repo = TimelineEventRepository(ctx.session)
    body = args.model_dump(exclude={'application_id', 'keep_open'})
    if args.event_type is not EventType.INTERVIEW and not args.keep_open:
        outcome = FinalizeWithOutcome.model_validate({
            'outcome': args.event_type.value,
            'event_date': args.event_date,
            'observation': args.observation,
            'salary_amount': args.salary_amount,
            'salary_currency': args.salary_currency,
            'salary_period': args.salary_period,
            'denied_reason': args.denied_reason,
        })
        use_case = FinalizeApplicationWithOutcomeUseCase(
            app_repo, timeline_repo, read_model(ctx.session)
        )
        closed = await use_case.execute(
            args.application_id,
            ctx.user_id,
            FinalizeOutcomeDTO(**outcome.model_dump()),
        )
        return Application.model_validate(closed)
    event = await CreateTimelineEventUseCase(app_repo, timeline_repo).execute(
        CreateTimelineEventDTO(
            user_id=ctx.user_id,
            application_id=args.application_id,
            **body,
        )
    )
    return TimelineEventOut.model_validate(event)


def _merged_event(sent: dict[str, Any], stored: Any) -> TimelineEventUpdate:
    """The full ``PUT`` body: what was sent, else what is stored when it
    still applies to the resulting type."""
    event_type = EventType(sent.get('event_type') or stored.event_type)
    keeps = {
        EventType.INTERVIEW: _INTERVIEW_ONLY,
        EventType.OFFER: _OFFER_ONLY,
        EventType.DENIED: _DENIED_ONLY,
    }[event_type]
    merged: dict[str, Any] = {'event_type': event_type}
    for field in TimelineEventUpdate.model_fields:
        if field == 'event_type':
            continue
        if field in sent:
            merged[field] = sent[field]
        elif field in ('event_date', 'observation') or field in keeps:
            merged[field] = getattr(stored, field)
    return TimelineEventUpdate.model_validate(merged)


async def edit_timeline_event(ctx: ToolContext, args: Any) -> TimelineEventOut:
    app_repo = ApplicationRepository(ctx.session)
    timeline_repo = TimelineEventRepository(ctx.session)
    # The REST PUT's order: the application (404), its locks (422/409),
    # then the event (404).
    application = await app_repo.get_by_id_and_user_id(
        args.application_id, ctx.user_id
    )
    if application is None:
        raise ResourceNotFound(
            APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
        )
    ensure_mutable(application)
    stored = await timeline_repo.get_by_id_and_user_id(
        args.event_id, args.application_id, ctx.user_id
    )
    if stored is None:
        raise ResourceNotFound(EVENT_NOT_FOUND, ErrorCode.EVT_EVENT_NOT_FOUND)
    fields = set(TimelineEventUpdate.model_fields) & args.model_fields_set
    payload = _merged_event(args.model_dump(include=fields), stored)
    event = await UpdateTimelineEventUseCase(app_repo, timeline_repo).execute(
        args.event_id,
        args.application_id,
        ctx.user_id,
        UpdateTimelineEventDTO(**payload.model_dump()),
    )
    return TimelineEventOut.model_validate(event)


async def delete_timeline_event(
    ctx: ToolContext, args: EventRef
) -> dict[str, Any]:
    use_case = DeleteTimelineEventUseCase(
        ApplicationRepository(ctx.session),
        TimelineEventRepository(ctx.session),
    )
    await use_case.execute(args.event_id, args.application_id, ctx.user_id)
    return deleted()


TOOLS = (
    McpTool(
        name='list_timeline',
        title='List timeline',
        description=(
            "An application's timeline events (interview, offer, denied), "
            'oldest first.'
        ),
        scope=McpScope.READ,
        input_model=ApplicationRef,
        handler=list_timeline,
        output_schema=list_output(TimelineEventOut),
    ),
    McpTool(
        name='add_timeline_event',
        title='Add timeline event',
        description=(
            'Add an event to an open application: interview '
            '(interview_type, optional start_time/end_time/timezone), offer '
            '(salary_amount, salary_currency, salary_period monthly|'
            'annually) or denied (denied_reason). An offer or denied event '
            'also closes the application and answers it, unless keep_open '
            'is true; an interview answers the event.'
        ),
        scope=McpScope.WRITE,
        input_model=AddTimelineEventIn,
        handler=add_timeline_event,
        output_schema=any_of_output(TimelineEventOut, Application),
    ),
    McpTool(
        name='edit_timeline_event',
        title='Edit timeline event',
        description=(
            'Change a timeline event. Only the fields you send change; '
            'stored fields that no longer apply to the event type are '
            'dropped. Send a field as null to empty it.'
        ),
        scope=McpScope.WRITE,
        input_model=EditTimelineEventIn,
        handler=edit_timeline_event,
        output_schema=object_output(TimelineEventOut),
    ),
    McpTool(
        name='delete_timeline_event',
        title='Delete timeline event',
        description='Delete a timeline event for good. Ask the user first.',
        scope=McpScope.DELETE,
        input_model=EventRef,
        handler=delete_timeline_event,
        output_schema=DELETED_OUTPUT,
    ),
)
