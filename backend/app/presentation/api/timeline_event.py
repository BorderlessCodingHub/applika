"""Application timeline routes (R-001..R-006).

Ported from mynextjob's ``api/timeline_event.py``. A thin router: every
route acts for the current user and on that user's own application and
events only; another user's application or event is a 404 (ADR 0004). No
business rule lives here: ownership, the write guards (archived 422, closed
409), the event rules and the one-initial-screening rule are the use
cases'. Ids are Snowflake strings on the wire (ADR 0003).
"""

from fastapi import APIRouter

from app.application.dto.timeline_event import (
    CreateTimelineEventDTO,
    UpdateTimelineEventDTO,
)
from app.application.use_cases.timeline_events.create import (
    CreateTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.delete import (
    DeleteTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.list import (
    ListTimelineEventsUseCase,
)
from app.application.use_cases.timeline_events.update import (
    UpdateTimelineEventUseCase,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    ApplicationRepositoryDp,
    CurrentUserDp,
    TimelineEventRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.timeline_event import (
    TimelineEventCreate,
    TimelineEventOut,
    TimelineEventUpdate,
)

router = APIRouter(
    prefix='/applications',
    tags=['Applications Timeline'],
    responses={'403': {'model': DetailSchema}},
)

_WRITE_RESPONSES: dict[int | str, dict] = {
    '404': {'model': DetailSchema, 'description': 'Not found or not owned'},
    '409': {
        'model': DetailSchema,
        'description': 'Application closed (reopen it to edit), or a second '
        'initial screening',
    },
    '422': {'description': 'Application archived in a cycle, or invalid event'},
}


@router.get(
    '/{application_id}/timeline',
    response_model=list[TimelineEventOut],
    responses={'404': {'model': DetailSchema}},
)
async def list_timeline_events(
    application_id: SnowflakeID,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """The application's events, ordered ``event_date``, ``start_time``
    (nulls first), ``created_at``."""
    use_case = ListTimelineEventsUseCase(app_repo, timeline_repo)
    events = await use_case.execute(application_id, c_user.id)
    return [TimelineEventOut.model_validate(event) for event in events]


@router.post(
    '/{application_id}/timeline',
    response_model=TimelineEventOut,
    status_code=201,
    responses=_WRITE_RESPONSES,
)
async def create_timeline_event(
    application_id: SnowflakeID,
    payload: TimelineEventCreate,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Add an event. An interview without ``interview_type`` is
    ``unknown``."""
    data = CreateTimelineEventDTO(
        user_id=c_user.id,
        application_id=application_id,
        **payload.model_dump(),
    )
    use_case = CreateTimelineEventUseCase(app_repo, timeline_repo)
    event = await use_case.execute(data)
    return TimelineEventOut.model_validate(event)


@router.put(
    '/{application_id}/timeline/{event_id}',
    response_model=TimelineEventOut,
    responses=_WRITE_RESPONSES,
)
async def update_timeline_event(
    application_id: SnowflakeID,
    event_id: SnowflakeID,
    payload: TimelineEventUpdate,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Replace an event with the full body sent."""
    use_case = UpdateTimelineEventUseCase(app_repo, timeline_repo)
    event = await use_case.execute(
        event_id,
        application_id,
        c_user.id,
        UpdateTimelineEventDTO(**payload.model_dump()),
    )
    return TimelineEventOut.model_validate(event)


@router.delete(
    '/{application_id}/timeline/{event_id}',
    status_code=204,
    responses=_WRITE_RESPONSES,
)
async def delete_timeline_event(
    application_id: SnowflakeID,
    event_id: SnowflakeID,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    use_case = DeleteTimelineEventUseCase(app_repo, timeline_repo)
    await use_case.execute(event_id, application_id, c_user.id)
