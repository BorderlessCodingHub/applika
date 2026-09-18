"""The deprecated ``/applications/{id}/steps`` routes on the timeline (R-016).

``applika-cli`` 0.1.4 lists, adds, edits and deletes *steps*. Each call is
translated onto a timeline event and handed to the timeline use cases, so a
step write obeys exactly the rules, guards and ownership of an event write
(archived 422, closed 409 "Reopen the application to edit it", another
user's row 404, one initial screening per application 409). The date-order
rules of the steps version are gone with them (PRD 0008 "Assumptions").

* Add: ``step_id`` must be a non-strict definition (a strict one is a 404,
  as it always was) and becomes its mapped event type and interview type.
  An offer takes owner decision (b)'s salary: 0, the application's currency
  or USD, its period or monthly.
* Edit: 0.1.4 ``steps edit`` without ``--step`` resends the ``step_id`` it
  read from the list, i.e. the event's *reverse* step. When the incoming
  ``step_id`` is that reverse step the event keeps its own type, interview
  type and salary, so a note, a technical interview or an offer is never
  flattened into interview/unknown by an edit that did not ask for it. The
  reverse step may be strict (Offer, Denied): that is accepted here, it is
  the event's own step and not a new pick.
* List: every event is shown as its reverse step, whatever wrote it.
* The response to an add or edit names the step the client picked; a later
  list names the reverse step (the same one, unless several definitions map
  to one event kind).
"""

from app.application.dto.legacy_step import LegacyStepDTO, LegacyStepWriteDTO
from app.application.dto.timeline_event import (
    CreateTimelineEventDTO,
    TimelineEventDTO,
    UpdateTimelineEventDTO,
)
from app.application.use_cases.applications.guards import ensure_mutable
from app.application.use_cases.compat.legacy_finalize import offer_salary
from app.application.use_cases.compat.step_translation import (
    ReverseStep,
    StepTranslator,
    event_kind_of,
)
from app.application.use_cases.timeline_events.create import (
    CreateTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.delete import (
    DeleteTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.list import (
    APPLICATION_NOT_FOUND,
    ListTimelineEventsUseCase,
)
from app.application.use_cases.timeline_events.update import (
    UpdateTimelineEventUseCase,
)
from app.core.enums import EventType
from app.core.exceptions import ResourceNotFound
from app.domain.models import ApplicationModel, StepDefinitionModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)

STEP_NOT_FOUND = 'Step not found or is invalid'
APPLICATION_STEP_NOT_FOUND = 'Application step not found or not owned by user'


def _shown_as(step: ReverseStep | None) -> ReverseStep:
    if step is None:  # Only with an empty steps_definition catalog.
        raise LookupError('the steps_definition catalog is empty')
    return step


def _to_legacy(event: TimelineEventDTO, step: ReverseStep) -> LegacyStepDTO:
    return LegacyStepDTO(
        id=event.id,
        created_at=event.created_at,
        updated_at=event.updated_at,
        application_id=event.application_id,
        step_id=step.id,
        step_name=step.name,
        step_date=event.event_date,
        start_time=event.start_time,
        end_time=event.end_time,
        timezone=event.timezone,
        observation=event.observation,
    )


def _as_reverse(step: StepDefinitionModel) -> ReverseStep:
    return ReverseStep(id=step.id, name=step.name, color=step.color)


class _LegacyStepsBase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        step_repo: StepDefinitionRepository,
        timeline_event_repo: TimelineEventRepository,
    ) -> None:
        self.application_repo = application_repo
        self.step_repo = step_repo
        self.timeline_event_repo = timeline_event_repo

    async def _mutable_application(
        self, application_id: int, user_id: int
    ) -> ApplicationModel:
        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(APPLICATION_NOT_FOUND)
        ensure_mutable(application)
        return application

    async def _non_strict_step(self, step_id: int) -> StepDefinitionModel:
        step = await self.step_repo.get_by_id_non_strict_only(step_id)
        if step is None:
            raise ResourceNotFound(STEP_NOT_FOUND)
        return step


class ListLegacyStepsUseCase(_LegacyStepsBase):
    async def execute(
        self, application_id: int, user_id: int
    ) -> list[LegacyStepDTO]:
        events = await ListTimelineEventsUseCase(
            self.application_repo, self.timeline_event_repo
        ).execute(application_id, user_id)
        if not events:
            return []
        translator = StepTranslator(await self.step_repo.get_all())
        return [
            _to_legacy(
                event,
                _shown_as(
                    translator.reverse(event.event_type, event.interview_type)
                ),
            )
            for event in events
        ]


class CreateLegacyStepUseCase(_LegacyStepsBase):
    async def execute(
        self, application_id: int, user_id: int, data: LegacyStepWriteDTO
    ) -> LegacyStepDTO:
        application = await self._mutable_application(application_id, user_id)
        step = await self._non_strict_step(data.step_id)

        event_type, interview_type = event_kind_of(step)
        salary = (
            offer_salary(application, None)
            if event_type is EventType.OFFER
            else {}
        )
        event = await CreateTimelineEventUseCase(
            self.application_repo, self.timeline_event_repo
        ).execute(
            CreateTimelineEventDTO.model_validate({
                'user_id': user_id,
                'application_id': application_id,
                'event_type': event_type,
                'interview_type': interview_type,
                'event_date': data.step_date,
                'start_time': data.start_time,
                'end_time': data.end_time,
                'timezone': data.timezone,
                'observation': data.observation,
                **salary,
            })
        )
        return _to_legacy(event, _as_reverse(step))


class UpdateLegacyStepUseCase(_LegacyStepsBase):
    async def execute(
        self,
        step_record_id: int,
        application_id: int,
        user_id: int,
        data: LegacyStepWriteDTO,
    ) -> LegacyStepDTO:
        application = await self._mutable_application(application_id, user_id)
        event = await self.timeline_event_repo.get_by_id_and_user_id(
            step_record_id, application_id, user_id
        )
        if event is None:
            raise ResourceNotFound(APPLICATION_STEP_NOT_FOUND)

        translator = StepTranslator(await self.step_repo.get_all())
        current = translator.reverse(event.event_type, event.interview_type)
        keep_salary = {
            'salary_amount': event.salary_amount,
            'salary_currency': event.salary_currency,
            'salary_period': event.salary_period,
        }
        # Preserved only when the event was already denied: a step switch
        # into Denied with no prior reason defaults to unknown, same as a
        # fresh legacy write (``normalize_event``).
        keep_denied_reason = (
            {'denied_reason': event.denied_reason}
            if event.event_type is EventType.DENIED
            else {}
        )
        if current is not None and current.id == data.step_id:
            # The step the list showed: the event keeps what it is.
            shown = current
            event_type, interview_type = event.event_type, event.interview_type
            salary = keep_salary if event_type is EventType.OFFER else {}
        else:
            step = await self._non_strict_step(data.step_id)
            shown = _as_reverse(step)
            event_type, interview_type = event_kind_of(step)
            if event_type is not EventType.OFFER:
                salary = {}
            elif event.event_type is EventType.OFFER:
                salary = keep_salary
            else:
                salary = offer_salary(application, None)
        denied_reason = (
            keep_denied_reason if event_type is EventType.DENIED else {}
        )

        updated = await UpdateTimelineEventUseCase(
            self.application_repo, self.timeline_event_repo
        ).execute(
            step_record_id,
            application_id,
            user_id,
            UpdateTimelineEventDTO.model_validate({
                'event_type': event_type,
                'interview_type': interview_type,
                'event_date': data.step_date,
                'start_time': data.start_time,
                'end_time': data.end_time,
                'timezone': data.timezone,
                'observation': data.observation,
                **salary,
                **denied_reason,
            }),
        )
        return _to_legacy(updated, shown)


class DeleteLegacyStepUseCase(_LegacyStepsBase):
    async def execute(
        self, step_record_id: int, application_id: int, user_id: int
    ) -> None:
        await DeleteTimelineEventUseCase(
            self.application_repo, self.timeline_event_repo
        ).execute(step_record_id, application_id, user_id)
