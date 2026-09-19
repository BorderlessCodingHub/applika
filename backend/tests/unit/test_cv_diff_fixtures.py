"""Shared fixture harness: the server diff matches ``fixtures/cv-diff/*.json``.

KODI-017 T091 (R-024/R-025). Every file under ``applika/fixtures/cv-diff/`` is
loaded and ``diff_cv(baseline, current).canonical()`` is asserted equal to its
``expected``, ``changes`` compared order-insensitively (sorted by
``(path, kind)``, per ``fixtures/cv-diff/README.md``) since the frontend's
own diff does not have to walk sections in the same order to agree on the
same set of changes.

This is the SAME fixture set the frontend's vitest suite reads
(``frontend/src/components/tailored-cvs/cv-diff.test.ts``), so passing here is
half of the proof that the web and the server diff agree; the other half is
that suite passing too.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from app.application.dto.tailored_cv import TailoredCVContent
from app.application.services.cv_diff import diff_cv

FIXTURES_DIR = Path(__file__).resolve().parents[3] / 'fixtures' / 'cv-diff'


def _load_fixtures() -> list[tuple[str, dict[str, Any]]]:
    files = sorted(FIXTURES_DIR.glob('*.json'))
    return [(path.name, json.loads(path.read_text())) for path in files]


FIXTURES = _load_fixtures()


def _sort_key(change: dict[str, Any]) -> tuple[str, str]:
    return (change['path'], change['kind'])


def test_fixtures_directory_is_not_empty():
    assert FIXTURES, f'No fixture files found under {FIXTURES_DIR}'


@pytest.mark.parametrize(
    ('filename', 'fixture'), FIXTURES, ids=[name for name, _ in FIXTURES]
)
def test_diff_matches_fixture(filename: str, fixture: dict[str, Any]):
    baseline = TailoredCVContent(**fixture['baseline'])
    current = TailoredCVContent(**fixture['current'])
    expected = fixture['expected']

    actual = diff_cv(baseline, current).canonical()

    assert actual['total'] == expected['total'], (
        filename,
        actual['total'],
        expected['total'],
    )
    assert actual['sections'] == expected['sections'], filename
    assert sorted(actual['changes'], key=_sort_key) == sorted(
        expected['changes'], key=_sort_key
    ), filename
