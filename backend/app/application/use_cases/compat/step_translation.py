"""Step <-> timeline event translation for ``applika-cli`` 0.1.4 (R-016).

Forward: a legacy ``step_id`` becomes the ``(event_type, interview_type)``
stored in ``steps_definition.event_type`` / ``interview_type``, the mapping
store revision ``afd4074c70c2`` filled from the owner's decision (a). A
definition with no mapping (created after that revision) falls back to
interview/unknown, the revision's ``STEP_FALLBACK``.

Reverse: an event becomes one ``steps_definition`` row, never null while the
catalog has a row. The resolution is **identical** to the revision's
``_reverse_step_id_sql`` (and to the one its downgrade uses): by the name in
``REVERSE_STEP_NAMES``, else the first row (by id) with the same mapping,
else the first non-strict row (``ORDER BY strict, id``). So an id a 0.1.4
client read from ``GET /steps`` stays the id it resends on ``steps edit``,
in this release, after a rollback, and after the contract migration
(plan 0008 "Risks": the reverse map must be stable across releases). The
catalog is frozen (R-021), so nothing moves the answer.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from app.core.enums import EventType, InterviewType
from app.domain.models import StepDefinitionModel

EventKind = tuple[EventType, InterviewType | None]

STEP_FALLBACK: EventKind = (EventType.INTERVIEW, InterviewType.UNKNOWN)
"""What an unmapped step definition becomes (revision ``STEP_FALLBACK``)."""

REVERSE_FALLBACK_NAME = 'Phase 2'

REVERSE_STEP_NAMES: dict[EventKind, str] = {
    (EventType.INTERVIEW, InterviewType.INITIAL_SCREENING): 'Initial Screen',
    **{
        (EventType.INTERVIEW, kind): REVERSE_FALLBACK_NAME
        for kind in InterviewType
        if kind is not InterviewType.INITIAL_SCREENING
    },
    (EventType.OFFER, None): 'Offer',
    (EventType.DENIED, None): 'Denied',
}
"""``(event_type, interview_type) -> steps_definition.name``, the
revision's ``REVERSE_STEP_MAP`` with the enums instead of strings, minus its
``note`` and ``feedback`` entries (ADR-0020): those named "Phase 2", the same
step as interview/unknown, which is what a former note or feedback is now,
so no step id a 0.1.4 client reads moves."""


def event_kind_of(step: StepDefinitionModel) -> EventKind:
    """The event a legacy step definition becomes."""
    if step.event_type is None:
        return STEP_FALLBACK
    if step.event_type is EventType.INTERVIEW:
        return (
            EventType.INTERVIEW,
            step.interview_type or InterviewType.UNKNOWN,
        )
    return (step.event_type, None)


@dataclass(frozen=True)
class ReverseStep:
    """The legacy step an event is shown as."""

    id: int
    name: str
    color: str


class StepTranslator:
    """The reverse map over one snapshot of the frozen catalog."""

    def __init__(self, catalog: Iterable[StepDefinitionModel]) -> None:
        self._catalog = sorted(catalog, key=lambda step: step.id)
        self._cache: dict[EventKind, ReverseStep | None] = {}

    def reverse(
        self, event_type: EventType, interview_type: InterviewType | None
    ) -> ReverseStep | None:
        """The step an event is shown as; ``None`` only on an empty catalog."""
        kind: EventKind = (event_type, interview_type)
        if kind not in self._cache:
            self._cache[kind] = self._resolve(kind)
        return self._cache[kind]

    def _resolve(self, kind: EventKind) -> ReverseStep | None:
        name = REVERSE_STEP_NAMES.get(kind, REVERSE_FALLBACK_NAME)
        by_name = next((s for s in self._catalog if s.name == name), None)
        if by_name is not None:
            return self._as_reverse(by_name)
        event_type, interview_type = kind
        by_mapping = next(
            (
                s
                for s in self._catalog
                if s.event_type == event_type
                and s.interview_type == interview_type
            ),
            None,
        )
        if by_mapping is not None:
            return self._as_reverse(by_mapping)
        # ORDER BY strict, id: the first non-strict row, else the first row.
        first = min(
            self._catalog, key=lambda s: (bool(s.strict), s.id), default=None
        )
        return self._as_reverse(first) if first is not None else None

    @staticmethod
    def _as_reverse(step: StepDefinitionModel) -> ReverseStep:
        return ReverseStep(id=step.id, name=step.name, color=step.color)
