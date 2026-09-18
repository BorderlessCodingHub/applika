"""Pins the app-side legacy feedback -> denied reason map against R3's own
copy (KODI-014, R-036).

``LEGACY_FEEDBACK_TO_DENIED_REASON`` (``use_cases/compat/legacy_finalize.py``)
is what the 0.1.4 legacy finalize body uses to map a feedback name to a
``DeniedReason`` when the mapped step is Denied. Migration ``c8b3e9f4a1d6``
(R3, folded into Release A) backfills every pre-existing ``denied`` event
with the exact same map, by the exact same rule ("match by name, never by
id"). A revision must not import another revision and app code must not
import a migration either, so both copies are duplicated independently -
this test is what keeps them from drifting apart, loading R3's module the
same way the migration test suite does (``importlib``, not a normal import).
"""

import importlib.util
from pathlib import Path

from app.application.use_cases.compat.legacy_finalize import (
    LEGACY_FEEDBACK_TO_DENIED_REASON,
    denied_reason_for_feedback,
)
from app.core.enums import DeniedReason

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_R3_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / 'c8b3e9f4a1d6_timeline_events_denied_reason.py'
)


def _load_r3_module():
    spec = importlib.util.spec_from_file_location(
        'timeline_denied_reason_migration_for_mapping_pin', _R3_MIGRATION_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_legacy_feedback_map_equals_r3s_backfill_map():
    r3 = _load_r3_module()

    assert {
        name: reason.value
        for name, reason in LEGACY_FEEDBACK_TO_DENIED_REASON.items()
    } == r3.FEEDBACK_TO_DENIED_REASON
    assert DeniedReason.UNKNOWN.value == r3.DENIED_REASON_FALLBACK


def test_every_mapped_name_resolves_the_same_reason():
    r3 = _load_r3_module()

    for name, reason_value in r3.FEEDBACK_TO_DENIED_REASON.items():
        assert denied_reason_for_feedback(name) is DeniedReason(reason_value)


def test_an_unmapped_or_unknown_name_falls_back_to_unknown():
    assert denied_reason_for_feedback('On going') is DeniedReason.UNKNOWN
    assert denied_reason_for_feedback('Accepted') is DeniedReason.UNKNOWN
    assert denied_reason_for_feedback('') is DeniedReason.UNKNOWN


def test_the_map_holds_exactly_the_seven_mapped_legacy_feedback_names():
    """R3's docstring/brief lists exactly these seven; the other two seeded
    feedback names (``On going``, ``Accepted``) and any admin-created one
    fall to ``unknown``."""
    assert set(LEGACY_FEEDBACK_TO_DENIED_REASON) == {
        'Not good enough',
        'Skills',
        'Assessment failed',
        'Too many candidates',
        'Position filled',
        'Role closed',
        'Ghost',
    }
    assert set(LEGACY_FEEDBACK_TO_DENIED_REASON.values()) == {
        DeniedReason.NOT_GOOD_ENOUGH,
        DeniedReason.SKILLS_MISMATCH,
        DeniedReason.ASSESSMENT_FAILED,
        DeniedReason.TOO_MANY_CANDIDATES,
        DeniedReason.POSITION_FILLED,
        DeniedReason.ROLE_CLOSED,
        DeniedReason.GHOSTED,
    }
