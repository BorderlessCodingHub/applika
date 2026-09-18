"""The statistics stages (R-023).

A stage is each interview type, then offer, then denied: always these nine,
in this order, whether or not the user has events in them. Notes and
feedback events are not stages. The owner: "with this type we can migrate
current steps definitions and still have the statistics per steps".
"""

from app.core.enums import EventType, InterviewType
from app.domain.repositories.user_statistic_repository import Stage

STAGES: tuple[Stage, ...] = (
    *((EventType.INTERVIEW, kind) for kind in InterviewType),
    (EventType.OFFER, None),
    (EventType.DENIED, None),
)
