"""Step <-> event translation (R-016), unit level.

Pinned:
* forward: every seeded step maps as the owner decided (decision (a)); an
  unmapped definition falls back to interview/unknown;
* reverse: every (event_type, interview_type) pair resolves to a step,
  non-null, by name first, then by mapping, then the first non-strict row;
* the constants are the ones revision afd4074c70c2 uses, so an id read in
  one release resolves the same in the next (plan 0008 "Risks"), minus its
  ``note`` and ``feedback`` entries (ADR-0020): both name "Phase 2", the
  step interview/unknown names, which is what a former note or feedback is.
"""

import importlib.util
from pathlib import Path

import pytest

from app.application.use_cases.compat.step_translation import (
    REVERSE_STEP_NAMES,
    STEP_FALLBACK,
    StepTranslator,
    event_kind_of,
)
from app.core.enums import EventType, InterviewType
from tests.unit.conftest import make_step_definition

IV = EventType.INTERVIEW
ALL_PAIRS = [(IV, kind) for kind in InterviewType] + [
    (kind, None) for kind in EventType if kind is not IV
]

# The production catalog after revision afd4074c70c2 (ids illustrative).
SEEDED = [
    make_step_definition(
        id=1,
        name='Initial Screen',
        event_type=IV,
        interview_type=InterviewType.INITIAL_SCREENING,
    ),
    make_step_definition(
        id=2,
        name='Phase 2',
        event_type=IV,
        interview_type=InterviewType.UNKNOWN,
    ),
    make_step_definition(
        id=3,
        name='Phase 3',
        event_type=IV,
        interview_type=InterviewType.UNKNOWN,
    ),
    make_step_definition(
        id=4,
        name='Phase 4',
        event_type=IV,
        interview_type=InterviewType.UNKNOWN,
    ),
    make_step_definition(
        id=5, name='Offer', strict=True, event_type=EventType.OFFER
    ),
    make_step_definition(
        id=6, name='Denied', strict=True, event_type=EventType.DENIED
    ),
]


def _revision():
    path = (
        Path(__file__).resolve().parents[2]
        / 'migrations'
        / 'versions'
        / 'afd4074c70c2_timeline_events_expand.py'
    )
    spec = importlib.util.spec_from_file_location('r1_revision', path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# -- Forward -----------------------------------------------------------------


@pytest.mark.parametrize(
    ('name', 'expected'),
    [
        ('Initial Screen', (IV, InterviewType.INITIAL_SCREENING)),
        ('Phase 2', (IV, InterviewType.UNKNOWN)),
        ('Phase 3', (IV, InterviewType.UNKNOWN)),
        ('Phase 4', (IV, InterviewType.UNKNOWN)),
        ('Offer', (EventType.OFFER, None)),
        ('Denied', (EventType.DENIED, None)),
    ],
)
def test_forward_follows_the_stored_mapping(name, expected):
    step = next(s for s in SEEDED if s.name == name)
    assert event_kind_of(step) == expected


def test_forward_unmapped_definition_falls_back_to_interview_unknown():
    step = make_step_definition(name='Take-home (admin)')
    assert event_kind_of(step) == STEP_FALLBACK == (IV, InterviewType.UNKNOWN)


def test_forward_interview_without_type_is_unknown():
    step = make_step_definition(event_type=IV, interview_type=None)
    assert event_kind_of(step) == (IV, InterviewType.UNKNOWN)


def test_forward_non_interview_never_carries_an_interview_type():
    step = make_step_definition(
        event_type=EventType.OFFER, interview_type=InterviewType.FINAL
    )
    assert event_kind_of(step) == (EventType.OFFER, None)


# -- Reverse -----------------------------------------------------------------


@pytest.mark.parametrize(('event_type', 'interview_type'), ALL_PAIRS)
def test_reverse_is_never_null_for_any_pair(event_type, interview_type):
    step = StepTranslator(SEEDED).reverse(event_type, interview_type)
    assert step is not None
    assert step.id
    assert step.name
    assert step.color


def test_reverse_by_name_on_the_seeded_catalog():
    translator = StepTranslator(SEEDED)
    screening = translator.reverse(IV, InterviewType.INITIAL_SCREENING)
    assert screening is not None
    assert screening.name == 'Initial Screen'
    for kind in InterviewType:
        if kind is InterviewType.INITIAL_SCREENING:
            continue
        step = translator.reverse(IV, kind)
        assert step is not None
        assert step.name == 'Phase 2'
    for event_type, name in [
        (EventType.OFFER, 'Offer'),
        (EventType.DENIED, 'Denied'),
    ]:
        step = translator.reverse(event_type, None)
        assert step is not None
        assert step.name == name


def test_round_trip_step_to_event_to_same_step_for_the_named_rows():
    translator = StepTranslator(SEEDED)
    for step in SEEDED:
        if step.name in {'Phase 3', 'Phase 4'}:
            continue  # several steps share interview/unknown -> Phase 2
        back = translator.reverse(*event_kind_of(step))
        assert back is not None
        assert back.id == step.id


def test_reverse_is_order_independent_and_takes_the_lowest_id():
    catalog = [
        make_step_definition(id=9, name='Phase 2'),
        make_step_definition(id=3, name='Phase 2'),
    ]
    step = StepTranslator(reversed(catalog)).reverse(IV, InterviewType.UNKNOWN)
    assert step is not None
    assert step.id == 3


def test_reverse_falls_back_to_mapping_when_the_name_is_missing():
    catalog = [
        make_step_definition(id=1, name='Applied'),
        make_step_definition(
            id=7,
            name='Screening call',
            event_type=IV,
            interview_type=InterviewType.INITIAL_SCREENING,
        ),
    ]
    step = StepTranslator(catalog).reverse(IV, InterviewType.INITIAL_SCREENING)
    assert step is not None
    assert step.id == 7


def test_reverse_falls_back_to_first_non_strict_row():
    catalog = [
        make_step_definition(id=1, name='Accepted', strict=True),
        make_step_definition(id=4, name='Applied', strict=False),
        make_step_definition(id=2, name='Rejected', strict=True),
    ]
    step = StepTranslator(catalog).reverse(EventType.OFFER, None)
    assert step is not None
    assert step.id == 4


def test_reverse_falls_back_to_a_strict_row_when_all_are_strict():
    catalog = [make_step_definition(id=8, name='Final', strict=True)]
    step = StepTranslator(catalog).reverse(IV, InterviewType.UNKNOWN)
    assert step is not None
    assert step.id == 8


def test_reverse_on_an_empty_catalog_is_none():
    assert StepTranslator([]).reverse(IV, InterviewType.UNKNOWN) is None


# -- Same constants as the migration ----------------------------------------


def test_constants_match_revision_afd4074c70c2():
    """Stable across releases: B code resolves like R1's SQL does."""
    revision = _revision()
    retired = {('note', None), ('feedback', None)}
    assert {
        (kind.value, interview and interview.value): name
        for (kind, interview), name in REVERSE_STEP_NAMES.items()
    } == {
        key: name
        for key, name in revision.REVERSE_STEP_MAP.items()
        if key not in retired
    }
    # ADR-0020: the two retired keys named the same step interview/unknown
    # names, so a former note or feedback keeps its step id.
    for key in retired:
        assert revision.REVERSE_STEP_MAP[key] == 'Phase 2'
        assert (
            revision.REVERSE_STEP_MAP[key]
            == revision.REVERSE_STEP_MAP[('interview', 'unknown')]
        )
    assert (
        STEP_FALLBACK[0].value,
        STEP_FALLBACK[1] and STEP_FALLBACK[1].value,
    ) == revision.STEP_FALLBACK
    assert set(REVERSE_STEP_NAMES) == set(ALL_PAIRS)


def test_former_note_and_feedback_reverse_to_the_row_the_revision_named():
    """ADR-0020: a former note or feedback is an interview of type unknown
    now. Its reverse step is the row revision afd4074c70c2 named for note
    and feedback ("Phase 2", id 2 here), not "Phase 3" or "Phase 4", which
    share the interview/unknown mapping but sort after it."""
    revision = _revision()
    step = StepTranslator(SEEDED).reverse(IV, InterviewType.UNKNOWN)
    assert step is not None
    assert step.id == 2
    assert step.name == revision.REVERSE_STEP_MAP[('note', None)]
    assert step.name == revision.REVERSE_STEP_MAP[('feedback', None)]


def test_event_type_has_exactly_three_members():
    assert [kind.value for kind in EventType] == [
        'interview',
        'offer',
        'denied',
    ]
