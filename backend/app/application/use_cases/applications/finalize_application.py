"""Finalize-application use cases: close, reversibly (R-007, R-009, R-032).

Closing stamps
``applications.finalized_at`` with the server's current UTC time. Without an
outcome it asks for no step, no feedback and no salary: the outcome and any
offered salary live on the timeline (an offer or denied event), and there is
no Offer <-> Accepted rule any more (R-012). Reopen undoes it.

``FinalizeApplicationWithOutcomeUseCase`` (R-032) is the new optional body:
an outcome event and ``finalized_at`` written atomically. The 0.1.4 body
(step, feedback, date, salary, observation) is the compat layer's
``LegacyFinalizeApplicationUseCase``.
"""

from datetime import UTC, datetime

from app.application.dto.application import ApplicationDTO, FinalizeOutcomeDTO
from app.application.dto.timeline_event import CreateTimelineEventDTO
from app.application.use_cases.applications.guards import (
    CLOSED_MESSAGE,
    ensure_not_archived,
)
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.use_cases.timeline_events.rules import (
    ensure_offer_period_allowed,
    normalize_event,
)
from app.application.validators.application_date import ensure_not_in_future
from app.config.logging import logger
from app.core.enums import EventType
from app.core.error_codes import ErrorCode
from app.core.exceptions import ApplicationFinalized, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)

APPLICATION_NOT_FOUND = 'Application not found or not owned by user'


class FinalizeApplicationUseCase:
    """Close one of the acting user's own applications.

    A missing or foreign application is a 404 (ADR 0004). An archived one
    is refused (422, applika's code). A closed one is *not* refused:
    finalizing it again is an idempotent no-op that keeps the original
    ``finalized_at`` and returns the current state (R-009). A real close is
    logged as ``application.finalized``.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        read_model: ApplicationReadModel,
    ) -> None:
        self.application_repo = application_repo
        self.read_model = read_model

    async def execute(
        self, application_id: int, user_id: int
    ) -> ApplicationDTO:
        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(
                APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
            )

        ensure_not_archived(application)

        if application.finalized_at is not None:
            # Already closed: idempotent no-op, current state returned.
            return await self.read_model.one(application)

        finalized_at = datetime.now(UTC)
        application.finalized_at = finalized_at
        application = await self.application_repo.update(application)

        logger.info(
            'application.finalized',
            extra={
                'extra_data': {
                    'event': 'application.finalized',
                    'application_id': application.id,
                    'user_id': user_id,
                    'finalized_at': finalized_at.isoformat(),
                }
            },
        )
        return await self.read_model.one(application)


class FinalizeApplicationWithOutcomeUseCase:
    """Close with an optional outcome event, atomically (R-032).

    ``data.outcome`` is always set here: a bodyless outcome is routed to
    :class:`FinalizeApplicationUseCase` instead (the existing idempotent
    close). Order: ownership (404), archived (422, ``ensure_not_archived``),
    already closed (409, the same message :func:`guards.ensure_mutable`
    uses for a timeline write), then the event date (defaults to today,
    422 in the future), then the offer's salary_period (``hourly`` refused,
    :func:`rules.ensure_offer_period_allowed` - fixed in KODI-011
    remediation round 1, R-032, so this offer event is never valid where
    a ``/timeline`` write of the same shape would be refused), then one
    write: the outcome event and
    ``finalized_at`` share the request's session, the same pattern
    ``LegacyFinalizeApplicationUseCase`` uses, so
    ``TimelineEventRepository.create``'s commit carries the close too and a
    failed insert (e.g. the R-030 unique-index race, though an outcome event
    is never an interview) rolls both back - ``finalized_at`` is never
    written without its event.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        timeline_event_repo: TimelineEventRepository,
        read_model: ApplicationReadModel,
    ) -> None:
        self.application_repo = application_repo
        self.timeline_event_repo = timeline_event_repo
        self.read_model = read_model

    async def execute(
        self, application_id: int, user_id: int, data: FinalizeOutcomeDTO
    ) -> ApplicationDTO:
        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(
                APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
            )

        ensure_not_archived(application)
        if application.finalized_at is not None:
            raise ApplicationFinalized(
                CLOSED_MESSAGE, ErrorCode.APP_APPLICATION_CLOSED
            )

        event_date = data.event_date or datetime.now(UTC).date()
        ensure_not_in_future(event_date, 'event_date')

        event_type = (
            EventType.OFFER if data.outcome == 'offer' else EventType.DENIED
        )
        event = normalize_event(
            CreateTimelineEventDTO.model_validate({
                'user_id': user_id,
                'application_id': application.id,
                'event_type': event_type,
                'interview_type': None,
                'denied_reason': data.denied_reason,
                'event_date': event_date,
                'observation': data.observation,
                'salary_amount': data.salary_amount,
                'salary_currency': data.salary_currency,
                'salary_period': data.salary_period,
            })
        )
        ensure_offer_period_allowed(event)

        application.finalized_at = datetime.now(UTC)
        created = await self.timeline_event_repo.create(event.model_dump())
        application = await self.application_repo.update(application)

        logger.info(
            'application.finalized',
            extra={
                'extra_data': {
                    'event': 'application.finalized',
                    'outcome': data.outcome,
                    'application_id': application.id,
                    'user_id': user_id,
                    'timeline_event_id': created.id,
                }
            },
        )
        return await self.read_model.one(application)
