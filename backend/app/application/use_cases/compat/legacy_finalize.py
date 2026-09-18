"""The 0.1.4 finalize body on the timeline (R-017, deprecated).

``applika-cli`` 0.1.4 finalizes with ``{step_id, feedback_id,
finalize_date, salary_offer?, observation?}``. This keeps that request
working: it closes the application **and** records the outcome as the
terminal timeline event of the mapped step, the way revision
``afd4074c70c2`` migrated applications finalized before the switch (R-014),
so both paths leave the same shape behind:

* the event type comes from the step's mapping (``step_translation``);
* the feedback name is appended to the observation as a last line
  ``Feedback: <name>`` (feedbacks are no longer data, PRD 0008
  "Assumptions");
* an offer event carries ``salary_offer`` or 0, the application's currency
  or USD, and its salary period or monthly: owner decision (b), the
  revision's convention;
* ``finalized_at`` is ``finalize_date`` at 00:00 UTC, as the revision
  backfills it from ``feedback_date``.

Checks, in the order the steps version ran them (so a 0.1.4 client sees the
answers it always saw): future date 422, application 404, archived 422,
already closed 409, strict step 404, feedback 404; then salary on a
non-offer step 422 and a second initial screening 409. There is no
Offer <-> Accepted coupling any more (R-012).
"""

from datetime import UTC, datetime, time
from decimal import Decimal

from app.application.dto.application import (
    ApplicationDTO,
    LegacyFinalizeApplicationDTO,
)
from app.application.dto.timeline_event import CreateTimelineEventDTO
from app.application.use_cases.applications.finalize_application import (
    APPLICATION_NOT_FOUND,
)
from app.application.use_cases.applications.guards import ensure_not_archived
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.use_cases.compat.step_translation import event_kind_of
from app.application.use_cases.timeline_events.rules import (
    ensure_one_initial_screening,
    normalize_event,
)
from app.application.validators.application_date import ensure_not_in_future
from app.config.logging import logger
from app.core.enums import Currency, EventType, SalaryPeriod
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    ResourceNotFound,
)
from app.domain.models import ApplicationModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)

ALREADY_FINALIZED = 'This application has already been finalized'
STEP_NOT_FOUND = 'Step not found or is invalid'
FEEDBACK_NOT_FOUND = 'Feedback not found'
SALARY_ONLY_ON_OFFER_STEP = (
    'salary_offer is only allowed when the step is an offer'
)

OFFER_DEFAULT_CURRENCY = Currency.USD
OFFER_DEFAULT_PERIOD = SalaryPeriod.MONTHLY


def append_feedback(observation: str | None, feedback_name: str) -> str:
    """The revision's ``_append_feedback_sql``: ``Feedback: <name>`` as the
    last line, after a blank line when there is an observation."""
    if not observation:
        return f'Feedback: {feedback_name}'
    return f'{observation}\n\nFeedback: {feedback_name}'


def offer_salary(
    application: ApplicationModel, amount: float | None
) -> dict[str, object]:
    """Owner decision (b): the amount or 0, the application's currency or
    USD, its period or monthly."""
    return {
        'salary_amount': (
            Decimal(str(amount)) if amount is not None else Decimal(0)
        ),
        'salary_currency': application.currency or OFFER_DEFAULT_CURRENCY,
        'salary_period': application.salary_period or OFFER_DEFAULT_PERIOD,
    }


class LegacyFinalizeApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        step_repo: StepDefinitionRepository,
        feedback_repo: FeedbackDefinitionRepository,
        timeline_event_repo: TimelineEventRepository,
        read_model: ApplicationReadModel,
    ) -> None:
        self.application_repo = application_repo
        self.step_repo = step_repo
        self.feedback_repo = feedback_repo
        self.timeline_event_repo = timeline_event_repo
        self.read_model = read_model

    async def execute(
        self,
        application_id: int,
        user_id: int,
        data: LegacyFinalizeApplicationDTO,
    ) -> ApplicationDTO:
        ensure_not_in_future(data.finalize_date, 'finalize_date')

        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(APPLICATION_NOT_FOUND)

        ensure_not_archived(application)
        if application.finalized_at is not None:
            raise ApplicationFinalized(ALREADY_FINALIZED)

        step = await self.step_repo.get_by_id_strict_only(data.step_id)
        if step is None:
            raise ResourceNotFound(STEP_NOT_FOUND)

        feedback = await self.feedback_repo.get_by_id(data.feedback_id)
        if feedback is None:
            raise ResourceNotFound(FEEDBACK_NOT_FOUND)

        event_type, interview_type = event_kind_of(step)
        if data.salary_offer is not None and event_type is not EventType.OFFER:
            raise BusinessRuleViolation(SALARY_ONLY_ON_OFFER_STEP)

        salary = (
            offer_salary(application, data.salary_offer)
            if event_type is EventType.OFFER
            else {}
        )
        event = normalize_event(
            CreateTimelineEventDTO.model_validate({
                'user_id': user_id,
                'application_id': application.id,
                'event_type': event_type,
                'interview_type': interview_type,
                'event_date': data.finalize_date,
                'observation': append_feedback(data.observation, feedback.name),
                **salary,
            })
        )
        await ensure_one_initial_screening(
            self.timeline_event_repo, application.id, event
        )

        # Stamped before the event is written: both repositories share the
        # request's session, so the event's commit carries the close too.
        application.finalized_at = datetime.combine(
            data.finalize_date, time(0, 0), tzinfo=UTC
        )
        created = await self.timeline_event_repo.create(event.model_dump())
        application = await self.application_repo.update(application)

        logger.info(
            'application.finalized',
            extra={
                'extra_data': {
                    'event': 'application.finalized',
                    'compat': 'legacy_finalize',
                    'application_id': application.id,
                    'user_id': user_id,
                    'step_id': step.id,
                    'feedback_id': feedback.id,
                    'timeline_event_id': created.id,
                }
            },
        )
        return await self.read_model.one(application)
