"""KODI-013: applika-cli 0.2.0 - timeline commands, finalize --outcome and
reopen. New tests only; the 0.1.4 tests in test_commands.py are untouched."""

import json
import re

import pytest
from conftest import FakeApiClient, FakeStore, make_session, reset_fake_client

import applika.app as cli_app
import applika.commands.applications.commands as applications_commands
from applika.app import app
from applika.lib.api import ApiError


def _setup(monkeypatch, session=None):
    store = FakeStore(session or make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_client()
    monkeypatch.setattr(applications_commands, 'ApiClient', FakeApiClient)
    return store


# --------------------------------------------------------------------------
# applications timeline list
# --------------------------------------------------------------------------


def test_timeline_list_outputs_table(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {
        '99': [
            {
                'id': '700',
                'application_id': '99',
                'user_id': '1',
                'event_type': 'interview',
                'interview_type': 'unknown',
                'event_date': '2026-06-01',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': 'Applied via referral',
                'salary_amount': None,
                'salary_currency': None,
                'salary_period': None,
                'created_at': '2026-06-01T00:00:00Z',
                'updated_at': None,
            }
        ]
    }

    result = runner.invoke(app, ['applications', 'timeline', 'list', '99'])

    assert result.exit_code == 0
    assert 'Applied via referral' in result.output
    assert '2026-06-01' in result.output


def test_timeline_list_outputs_json(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {
        '99': [
            {
                'id': '700',
                'application_id': '99',
                'user_id': '1',
                'event_type': 'interview',
                'interview_type': 'unknown',
                'event_date': '2026-06-01',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
                'salary_amount': None,
                'salary_currency': None,
                'salary_period': None,
                'created_at': '2026-06-01T00:00:00Z',
                'updated_at': None,
            }
        ]
    }

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'list', '99', '--output-format', 'json'],
    )

    assert result.exit_code == 0
    assert json.loads(result.output)[0]['id'] == '700'


def test_timeline_list_shows_denied_reason_label(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {
        '99': [
            {
                'id': '700',
                'application_id': '99',
                'user_id': '1',
                'event_type': 'denied',
                'interview_type': None,
                'denied_reason': 'skills_mismatch',
                'event_date': '2026-06-01',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
                'salary_amount': None,
                'salary_currency': None,
                'salary_period': None,
                'created_at': '2026-06-01T00:00:00Z',
                'updated_at': None,
            }
        ]
    }

    result = runner.invoke(app, ['applications', 'timeline', 'list', '99'])

    assert result.exit_code == 0
    assert 'Skills mismatch' in result.output


def test_timeline_list_tolerates_missing_denied_reason(monkeypatch, runner):
    """An older API's response may not include ``denied_reason`` at all;
    the list must still render without crashing."""
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {
        '99': [
            {
                'id': '700',
                'application_id': '99',
                'user_id': '1',
                'event_type': 'denied',
                'interview_type': None,
                'event_date': '2026-06-01',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
                'salary_amount': None,
                'salary_currency': None,
                'salary_period': None,
                'created_at': '2026-06-01T00:00:00Z',
                'updated_at': None,
            }
        ]
    }

    result = runner.invoke(app, ['applications', 'timeline', 'list', '99'])

    assert result.exit_code == 0
    assert '2026-06-01' in result.output


def test_timeline_add_denied_prints_reason_label_in_summary(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '706',
        'event_type': 'denied',
        'event_date': '2026-06-12',
        'denied_reason': 'position_filled',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-12',
            '--reason',
            'position_filled',
        ],
    )

    assert result.exit_code == 0
    assert 'Position filled' in result.output


# --------------------------------------------------------------------------
# applications timeline add
# --------------------------------------------------------------------------


def test_timeline_add_interview_builds_matching_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '700',
        'event_type': 'interview',
        'event_date': '2026-06-01',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-01',
            '--observation',
            'Applied via referral',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/timeline'
    assert FakeApiClient.captured_post_payload == {
        'event_type': 'interview',
        'interview_type': 'unknown',
        'denied_reason': None,
        'event_date': '2026-06-01',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': 'Applied via referral',
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
    }


def test_timeline_add_interview_defaults_interview_type_unknown(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '701',
        'event_type': 'interview',
        'event_date': '2026-06-02',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-02',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['interview_type'] == 'unknown'


def test_timeline_add_interview_type_on_non_interview_refused(
    monkeypatch, runner
):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-02',
            '--interview-type',
            'technical',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--interview-type is only allowed with --type interview'
        in result.output
    )


def test_timeline_add_offer_requires_full_salary_triad(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'offer',
            '--date',
            '2026-06-03',
            '--salary',
            '5000',
            '--period',
            'monthly',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--salary, --currency and --period are required with --type offer'
        in result.output
    )


def test_timeline_add_offer_rejects_hourly_period(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'offer',
            '--date',
            '2026-06-03',
            '--salary',
            '5000',
            '--currency',
            'USD',
            '--period',
            'hourly',
        ],
    )

    assert result.exit_code != 0


def test_timeline_add_offer_rejects_legacy_annual_period(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'offer',
            '--date',
            '2026-06-03',
            '--salary',
            '5000',
            '--currency',
            'USD',
            '--period',
            'annual',
        ],
    )

    assert result.exit_code != 0


def test_timeline_add_salary_on_non_offer_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-03',
            '--salary',
            '5000',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--salary, --currency and --period are only allowed with --type offer'
        in result.output
    )


def test_timeline_add_interview_with_full_flags_builds_matching_payload(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '702',
        'event_type': 'interview',
        'event_date': '2026-06-04',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--interview-type',
            'initial_screening',
            '--date',
            '2026-06-04',
            '--start-time',
            '14:00',
            '--end-time',
            '15:00',
            '--timezone',
            'America/Sao_Paulo',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload == {
        'event_type': 'interview',
        'interview_type': 'initial_screening',
        'denied_reason': None,
        'event_date': '2026-06-04',
        'start_time': '14:00',
        'end_time': '15:00',
        'timezone': 'America/Sao_Paulo',
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
    }


def test_timeline_add_start_time_without_end_time_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-04',
            '--start-time',
            '14:00',
        ],
    )

    assert result.exit_code == 1
    assert 'start-time and end-time must be provided together' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_timeline_add_end_time_before_start_time_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-04',
            '--start-time',
            '15:00',
            '--end-time',
            '14:00',
        ],
    )

    assert result.exit_code == 1
    assert 'end-time must be after start-time' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_timeline_add_offer_happy_path_builds_matching_payload(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '703',
        'event_type': 'offer',
        'event_date': '2026-06-10',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'offer',
            '--date',
            '2026-06-10',
            '--salary',
            '180000',
            '--currency',
            'USD',
            '--period',
            'annually',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload == {
        'event_type': 'offer',
        'interview_type': None,
        'denied_reason': None,
        'event_date': '2026-06-10',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': 180000.0,
        'salary_currency': 'USD',
        'salary_period': 'annually',
    }


def test_timeline_add_denied_defaults_reason_unknown(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '704',
        'event_type': 'denied',
        'event_date': '2026-06-11',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-11',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['denied_reason'] == 'unknown'


def test_timeline_add_denied_with_reason_builds_matching_payload(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '705',
        'event_type': 'denied',
        'event_date': '2026-06-11',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-11',
            '--reason',
            'skills_mismatch',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload == {
        'event_type': 'denied',
        'interview_type': None,
        'denied_reason': 'skills_mismatch',
        'event_date': '2026-06-11',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
    }


def test_timeline_add_reason_on_non_denied_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-11',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 1
    assert '--reason is only allowed with --type denied' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_timeline_add_409_prints_reopen_hint(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.post_json_error = ApiError(
        'Reopen the application to edit it (it is currently closed)', 409
    )

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-03',
        ],
    )

    assert result.exit_code == 1
    assert 'Reopen the application to edit it' in result.output
    assert 'applika applications reopen 99' in result.output


# --------------------------------------------------------------------------
# applications timeline edit
# --------------------------------------------------------------------------


def _offer_event():
    return {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'offer',
        'interview_type': None,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': 'Great offer',
        'salary_amount': '5000.00',
        'salary_currency': 'USD',
        'salary_period': 'monthly',
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }


def test_timeline_edit_type_change_away_from_offer_drops_salary(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_offer_event()]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'edit', '99', '700', '--type', 'denied'],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_path == '/applications/99/timeline/700'
    assert FakeApiClient.captured_put_payload == {
        'event_type': 'denied',
        'interview_type': None,
        'denied_reason': 'unknown',
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': 'Great offer',
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
    }


def test_timeline_edit_type_change_to_interview_defaults_unknown(
    monkeypatch, runner
):
    _setup(monkeypatch)
    source_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [source_event]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'interview',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--type',
            'interview',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['interview_type'] == 'unknown'


def test_timeline_edit_to_offer_requires_triad_when_event_lacked_one(
    monkeypatch, runner
):
    _setup(monkeypatch)
    source_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'interview',
        'interview_type': 'unknown',
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [source_event]}

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'edit', '99', '700', '--type', 'offer'],
    )

    assert result.exit_code == 1
    assert (
        '--salary, --currency and --period are required with --type offer'
        in result.output
    )


def test_timeline_edit_keeps_offer_triad_when_event_already_had_one(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_offer_event()]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'offer',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--observation',
            'Updated note',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload == {
        'event_type': 'offer',
        'interview_type': None,
        'denied_reason': None,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': 'Updated note',
        'salary_amount': 5000.0,
        'salary_currency': 'USD',
        'salary_period': 'monthly',
    }


def _denied_event(reason='skills_mismatch'):
    return {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'denied_reason': reason,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }


def test_timeline_edit_denied_without_reason_preserves_current_reason(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_denied_event('skills_mismatch')]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--observation',
            'Updated note',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['denied_reason'] == (
        'skills_mismatch'
    )


def test_timeline_edit_denied_with_reason_overrides_current_reason(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_denied_event('skills_mismatch')]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['denied_reason'] == 'ghosted'


def test_timeline_edit_type_change_away_from_denied_drops_reason(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_denied_event('skills_mismatch')]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'interview',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--type',
            'interview',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['denied_reason'] is None


def test_timeline_edit_reason_on_type_change_away_from_denied_refused(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_denied_event('skills_mismatch')]}

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--type',
            'interview',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 1
    assert '--reason is only allowed with --type denied' in result.output
    assert FakeApiClient.captured_put_payload is None


def test_timeline_edit_reason_with_no_type_on_non_denied_event_refused(
    monkeypatch, runner
):
    """--reason with no --type at all, on an event that is not (and does
    not become) denied, must be refused too - not just the explicit
    --type interview case."""
    _setup(monkeypatch)
    source_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'interview',
        'interview_type': 'unknown',
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [source_event]}

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 1
    assert '--reason is only allowed with --type denied' in result.output
    assert FakeApiClient.captured_put_payload is None


def test_timeline_edit_type_change_to_denied_without_reason_defaults_unknown(
    monkeypatch, runner
):
    _setup(monkeypatch)
    source_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'interview',
        'interview_type': 'unknown',
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [source_event]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'edit', '99', '700', '--type', 'denied'],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['denied_reason'] == 'unknown'


def test_timeline_edit_tolerates_missing_denied_reason_in_response(
    monkeypatch, runner
):
    """An older API may not send ``denied_reason`` at all. Editing a denied
    event it returned without touching --reason must default to unknown,
    not crash."""
    _setup(monkeypatch)
    legacy_denied_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [legacy_denied_event]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--observation',
            'Updated note',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['denied_reason'] == 'unknown'


# --------------------------------------------------------------------------
# KODI-016: schedule (start-time/end-time/timezone) refused off interview,
# a stored schedule never re-sent once the resulting type is not interview,
# and a timeline event dict missing the three schedule keys is tolerated.
# --------------------------------------------------------------------------


def _interview_event(**overrides):
    event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'interview',
        'interview_type': 'technical',
        'event_date': '2026-06-05',
        'start_time': '10:00:00',
        'end_time': '11:00:00',
        'timezone': 'America/Sao_Paulo',
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    event.update(overrides)
    return event


def test_timeline_add_start_and_end_time_on_non_interview_refused(
    monkeypatch, runner
):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-05',
            '--start-time',
            '10:00',
            '--end-time',
            '11:00',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--start-time, --end-time and --timezone are only allowed with '
        '--type interview' in result.output
    )
    assert FakeApiClient.captured_post_payload is None


def test_timeline_add_timezone_alone_on_non_interview_refused(
    monkeypatch, runner
):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'denied',
            '--date',
            '2026-06-05',
            '--timezone',
            'America/Sao_Paulo',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--start-time, --end-time and --timezone are only allowed with '
        '--type interview' in result.output
    )
    assert FakeApiClient.captured_post_payload is None


def test_timeline_add_interview_schedule_still_accepted(monkeypatch, runner):
    """Interview add behaviour is unchanged by KODI-016."""
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '703',
        'event_type': 'interview',
        'event_date': '2026-06-06',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            'interview',
            '--date',
            '2026-06-06',
            '--start-time',
            '10:00',
            '--end-time',
            '11:00',
            '--timezone',
            'America/Sao_Paulo',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['start_time'] == '10:00'
    assert FakeApiClient.captured_post_payload['end_time'] == '11:00'
    assert (
        FakeApiClient.captured_post_payload['timezone'] == 'America/Sao_Paulo'
    )


def test_timeline_edit_start_and_end_time_on_non_interview_event_refused(
    monkeypatch, runner
):
    """No --type given: the resulting type is the event's current type."""
    _setup(monkeypatch)
    source_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [source_event]}

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--start-time',
            '10:00',
            '--end-time',
            '11:00',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--start-time, --end-time and --timezone are only allowed with '
        '--type interview' in result.output
    )
    assert FakeApiClient.captured_put_payload is None


def test_timeline_edit_schedule_flags_on_type_change_away_from_interview_refused(
    monkeypatch, runner
):
    """The resulting type (the --type given) governs the refusal, not the
    event's current type."""
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_interview_event()]}

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--type',
            'denied',
            '--start-time',
            '10:00',
            '--end-time',
            '11:00',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--start-time, --end-time and --timezone are only allowed with '
        '--type interview' in result.output
    )
    assert FakeApiClient.captured_put_payload is None


def test_timeline_edit_type_change_away_from_interview_clears_stored_schedule(
    monkeypatch, runner
):
    """AC1: editing away from interview never re-sends the stored
    schedule - the PUT is a full replace and sends null for all three
    fields, even though the event being edited has a real one."""
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_interview_event()]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'edit', '99', '700', '--type', 'denied'],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload == {
        'event_type': 'denied',
        'interview_type': None,
        'denied_reason': 'unknown',
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
    }


def test_timeline_edit_legacy_stored_schedule_on_non_interview_event_not_resent(
    monkeypatch, runner
):
    """AC1, legacy-data variant: a non-interview event that (from before
    the schedule-only-on-interview rule) still carries a stored schedule
    must not have it re-sent on an unrelated edit."""
    _setup(monkeypatch)
    legacy_denied_with_schedule = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'start_time': '09:00:00',
        'end_time': '09:30:00',
        'timezone': 'America/Sao_Paulo',
        'observation': 'Old note',
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [legacy_denied_with_schedule]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--observation',
            'Updated note',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['start_time'] is None
    assert FakeApiClient.captured_put_payload['end_time'] is None
    assert FakeApiClient.captured_put_payload['timezone'] is None


def test_timeline_edit_interview_schedule_kept_when_type_unchanged(
    monkeypatch, runner
):
    """Interview edit behaviour is unchanged: an edit that neither passes
    --type nor touches the schedule flags keeps resending the event's
    current schedule, same as interview_type/denied_reason."""
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_interview_event()]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'interview',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--observation',
            'Rescheduled internally',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['start_time'] == '10:00:00'
    assert FakeApiClient.captured_put_payload['end_time'] == '11:00:00'
    assert FakeApiClient.captured_put_payload['timezone'] == 'America/Sao_Paulo'


def test_timeline_edit_schedule_flags_allowed_on_type_change_to_interview(
    monkeypatch, runner
):
    _setup(monkeypatch)
    source_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [source_event]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'interview',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--type',
            'interview',
            '--start-time',
            '14:00',
            '--end-time',
            '15:00',
            '--timezone',
            'America/Sao_Paulo',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['start_time'] == '14:00'
    assert FakeApiClient.captured_put_payload['end_time'] == '15:00'
    assert FakeApiClient.captured_put_payload['timezone'] == 'America/Sao_Paulo'


def test_timeline_list_tolerates_absent_schedule_keys(monkeypatch, runner):
    """The API now omits start_time/end_time/timezone entirely on
    non-interview events (not null) - the CLI must not KeyError."""
    _setup(monkeypatch)
    event_without_schedule_keys = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'observation': 'No schedule keys at all',
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [event_without_schedule_keys]}

    table_result = runner.invoke(
        app, ['applications', 'timeline', 'list', '99']
    )
    assert table_result.exit_code == 0
    assert 'No schedule keys at all' in table_result.output
    assert 'None' not in table_result.output

    json_result = runner.invoke(
        app,
        ['applications', 'timeline', 'list', '99', '--output-format', 'json'],
    )
    assert json_result.exit_code == 0
    payload = json.loads(json_result.output)
    assert 'start_time' not in payload[0]
    assert 'end_time' not in payload[0]
    assert 'timezone' not in payload[0]


def test_timeline_edit_existing_event_without_schedule_keys_tolerated(
    monkeypatch, runner
):
    """_get_timeline_event_or_exit reads the event the API returns; an
    absent schedule key on a non-interview event must not crash the
    resolution/fallback logic."""
    _setup(monkeypatch)
    event_without_schedule_keys = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'denied',
        'interview_type': None,
        'event_date': '2026-06-05',
        'observation': 'No schedule keys at all',
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'created_at': '2026-06-05T00:00:00Z',
        'updated_at': None,
    }
    FakeApiClient.timeline_events = {'99': [event_without_schedule_keys]}
    FakeApiClient.event_updated_response = {
        'id': '700',
        'event_type': 'denied',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--observation',
            'Updated note',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['start_time'] is None
    assert FakeApiClient.captured_put_payload['end_time'] is None
    assert FakeApiClient.captured_put_payload['timezone'] is None


def test_timeline_edit_not_found_reports_clean_error(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': []}

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '999',
            '--type',
            'interview',
        ],
    )

    assert result.exit_code == 1
    assert 'Timeline event not found' in result.output


# --------------------------------------------------------------------------
# applications timeline delete
# --------------------------------------------------------------------------


def test_timeline_delete_calls_correct_endpoint(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app, ['applications', 'timeline', 'delete', '99', '700']
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_delete_path == '/applications/99/timeline/700'
    assert 'Deleted event: id=700' in result.output


def test_timeline_delete_409_prints_reopen_hint(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.delete_error = ApiError(
        'Reopen the application to edit it (it is currently closed)', 409
    )

    result = runner.invoke(
        app, ['applications', 'timeline', 'delete', '99', '700']
    )

    assert result.exit_code == 1
    assert 'applika applications reopen 99' in result.output


# --------------------------------------------------------------------------
# applications finalize
# --------------------------------------------------------------------------


def test_finalize_bodyless_sends_no_body(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': None,
        # Deliberately misleading: a future interview sorts after the
        # close and would be Application.last_step, even though this close
        # carried no outcome at all - the output must not read it.
        'last_step': {'name': 'Initial Screen', 'date': '2026-09-22'},
        'feedback': None,
        'finalized': True,
        'finalized_at': '2026-06-01T00:00:00+00:00',
    }

    result = runner.invoke(app, ['applications', 'finalize', '99'])

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/finalize'
    assert FakeApiClient.captured_post_payload is None
    assert (
        'Finalized application: id=99 company=Acme role=Backend Engineer '
        'status=closed finalized_at=2026-06-01T00:00:00+00:00' in result.output
    )
    assert 'final_step' not in result.output
    assert 'outcome=' not in result.output


def test_finalize_outcome_offer_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': 9000.0,
        # Same trap as above: last_step must not be what the output reads.
        'last_step': {'name': 'Initial Screen', 'date': '2026-09-22'},
        'feedback': None,
        'finalized': True,
        'finalized_at': '2026-06-10T00:00:00+00:00',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--outcome',
            'offer',
            '--salary',
            '9000',
            '--currency',
            'EUR',
            '--period',
            'annually',
            '--date',
            '2026-06-10',
            '--observation',
            'Signed',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload == {
        'outcome': 'offer',
        'event_date': '2026-06-10',
        'observation': 'Signed',
        'salary_amount': 9000.0,
        'salary_currency': 'EUR',
        'salary_period': 'annually',
        'denied_reason': None,
    }
    assert (
        'Finalized application: id=99 company=Acme role=Backend Engineer '
        'status=closed finalized_at=2026-06-10T00:00:00+00:00 '
        'outcome=offer' in result.output
    )
    assert 'final_step' not in result.output


def test_finalize_outcome_denied_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': None,
        'last_step': {'name': 'Initial Screen', 'date': '2026-09-22'},
        'feedback': None,
        'finalized': True,
        'finalized_at': '2026-06-10T00:00:00+00:00',
    }

    result = runner.invoke(
        app, ['applications', 'finalize', '99', '--outcome', 'denied']
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload == {
        'outcome': 'denied',
        'event_date': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'denied_reason': 'unknown',
    }
    assert (
        'Finalized application: id=99 company=Acme role=Backend Engineer '
        'status=closed finalized_at=2026-06-10T00:00:00+00:00 '
        'outcome=denied' in result.output
    )
    assert 'final_step' not in result.output


def test_finalize_outcome_offer_without_salary_triad_refused(
    monkeypatch, runner
):
    _setup(monkeypatch)

    result = runner.invoke(
        app, ['applications', 'finalize', '99', '--outcome', 'offer']
    )

    assert result.exit_code == 1
    assert (
        '--salary, --currency and --period are required when --outcome offer'
        in result.output
    )
    assert FakeApiClient.captured_post_payload is None


def test_finalize_salary_without_outcome_offer_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app, ['applications', 'finalize', '99', '--salary', '1000']
    )

    assert result.exit_code == 1
    assert (
        '--salary, --currency and --period are only allowed when --outcome offer'
        in result.output
    )


def test_finalize_salary_with_outcome_denied_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--outcome',
            'denied',
            '--salary',
            '1000',
            '--currency',
            'USD',
            '--period',
            'monthly',
        ],
    )

    assert result.exit_code == 1
    assert (
        '--salary, --currency and --period are only allowed when --outcome offer'
        in result.output
    )


def test_finalize_date_without_outcome_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app, ['applications', 'finalize', '99', '--date', '2026-06-10']
    )

    assert result.exit_code == 1
    assert (
        '--date and --observation require --outcome (offer or denied)'
        in result.output
    )


def test_finalize_outcome_rejects_legacy_annual_period(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--outcome',
            'offer',
            '--salary',
            '1000',
            '--currency',
            'USD',
            '--period',
            'annual',
        ],
    )

    assert result.exit_code != 0


def test_finalize_outcome_denied_with_reason_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': None,
        'last_step': None,
        'feedback': None,
        'finalized': True,
        'finalized_at': '2026-06-11T00:00:00+00:00',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--outcome',
            'denied',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['denied_reason'] == 'ghosted'


def test_finalize_reason_with_outcome_offer_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--outcome',
            'offer',
            '--salary',
            '1000',
            '--currency',
            'USD',
            '--period',
            'monthly',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 1
    assert '--reason is only allowed when --outcome denied' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_finalize_reason_without_outcome_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app, ['applications', 'finalize', '99', '--reason', 'ghosted']
    )

    assert result.exit_code == 1
    assert '--reason is only allowed when --outcome denied' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_finalize_reason_with_legacy_step_path_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--step',
            'Denied',
            '--feedback',
            'Not good enough',
            '--date',
            '2026-06-10',
            '--reason',
            'ghosted',
        ],
    )

    assert result.exit_code == 1
    assert 'cannot be combined with --outcome' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_finalize_legacy_step_path_requires_feedback_and_date(
    monkeypatch, runner
):
    _setup(monkeypatch)

    result = runner.invoke(
        app, ['applications', 'finalize', '99', '--step', 'Offer']
    )

    assert result.exit_code == 1
    assert (
        'the deprecated finalize body requires --step, --feedback and '
        '--date together' in result.output
    )


def test_finalize_mixing_legacy_and_new_flags_refused(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--step',
            'Offer',
            '--feedback',
            'Accepted',
            '--date',
            '2026-06-10',
            '--outcome',
            'offer',
        ],
    )

    assert result.exit_code == 1
    assert 'cannot be combined with --outcome' in result.output


def test_finalize_409_prints_reopen_hint(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.post_error = ApiError(
        'Reopen the application to edit it (it is currently closed)', 409
    )

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--outcome',
            'offer',
            '--salary',
            '1',
            '--currency',
            'USD',
            '--period',
            'monthly',
        ],
    )

    assert result.exit_code == 1
    assert 'Reopen the application to edit it' in result.output
    assert 'applika applications reopen 99' in result.output


def test_finalize_bodyless_idempotent_output(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': None,
        'last_step': None,
        'feedback': None,
        'finalized': True,
        'finalized_at': '2026-06-01T00:00:00+00:00',
    }

    first = runner.invoke(app, ['applications', 'finalize', '99'])
    second = runner.invoke(app, ['applications', 'finalize', '99'])

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert first.output == second.output
    assert 'status=closed' in first.output
    assert 'finalized_at=2026-06-01T00:00:00+00:00' in first.output


# --------------------------------------------------------------------------
# applications reopen
# --------------------------------------------------------------------------


def test_reopen_sends_no_body_and_is_idempotent(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.reopened_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'application_date': '2026-01-01',
        # Deliberately misleading, same as the finalize traps above: a
        # stale last_step must not leak into the reopen output either.
        'last_step': {'name': 'Initial Screen', 'date': '2026-09-22'},
        'finalized': False,
        'finalized_at': None,
    }

    first = runner.invoke(app, ['applications', 'reopen', '99'])
    assert FakeApiClient.captured_post_payload is None
    second = runner.invoke(app, ['applications', 'reopen', '99'])

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/reopen'
    assert (
        'Reopened application: id=99 company=Acme role=Backend Engineer '
        'status=open finalized_at=-' in first.output
    )
    assert 'final_step' not in first.output
    assert first.output == second.output


# --------------------------------------------------------------------------
# applications edit - annually / new currencies (0.1.4 limitation fixed)
# --------------------------------------------------------------------------


def test_edit_works_on_application_with_annually_salary_period(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.supports = {'platforms': [{'id': '10', 'name': 'LinkedIn'}]}
    FakeApiClient.applications = [
        {
            'id': '50',
            'company_id': None,
            'company_name': 'Acme',
            'platform_id': '10',
            'role': 'Engineer',
            'mode': 'active',
            'application_date': '2026-01-01',
            'link_to_job': None,
            'observation': None,
            'country': None,
            'currency': 'USD',
            'salary_period': 'annually',
            'expected_salary': 100000.0,
            'salary_range_min': None,
            'salary_range_max': None,
            'experience_level': None,
            'work_mode': None,
            'finalized': False,
        }
    ]
    FakeApiClient.updated_response = {
        'id': '50',
        'company_name': 'Acme',
        'role': 'Staff Engineer',
        'application_date': '2026-01-01',
    }

    result = runner.invoke(
        app, ['applications', 'edit', '50', '--role', 'Staff Engineer']
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['salary_period'] == 'annually'


def test_edit_works_on_application_with_new_currency(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = {'platforms': [{'id': '10', 'name': 'LinkedIn'}]}
    FakeApiClient.applications = [
        {
            'id': '51',
            'company_id': None,
            'company_name': 'Acme',
            'platform_id': '10',
            'role': 'Engineer',
            'mode': 'active',
            'application_date': '2026-01-01',
            'link_to_job': None,
            'observation': None,
            'country': None,
            'currency': 'CNY',
            'salary_period': 'monthly',
            'expected_salary': 30000.0,
            'salary_range_min': None,
            'salary_range_max': None,
            'experience_level': None,
            'work_mode': None,
            'finalized': False,
        }
    ]
    FakeApiClient.updated_response = {
        'id': '51',
        'company_name': 'Acme',
        'role': 'Staff Engineer',
        'application_date': '2026-01-01',
    }

    result = runner.invoke(
        app, ['applications', 'edit', '51', '--role', 'Staff Engineer']
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['currency'] == 'CNY'


# --------------------------------------------------------------------------
# deprecation surfaces in --help (not Typer's deprecated=True, see
# commands/applications/__init__.py - this asserts the help text itself)
# --------------------------------------------------------------------------


def test_applications_help_marks_steps_deprecated(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(app, ['applications', '--help'])

    assert result.exit_code == 0
    assert '[DEPRECATED]' in result.output


def test_steps_help_marks_itself_and_subcommands_deprecated(
    monkeypatch, runner
):
    _setup(monkeypatch)

    top = runner.invoke(app, ['applications', 'steps', '--help'])
    sub = runner.invoke(app, ['applications', 'steps', 'add', '--help'])

    assert top.exit_code == 0
    assert '[DEPRECATED]' in top.output
    assert 'applications timeline' in top.output
    assert sub.exit_code == 0
    assert '[DEPRECATED]' in sub.output


def test_finalize_help_marks_legacy_flags_deprecated(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(app, ['applications', 'finalize', '--help'])

    assert result.exit_code == 0
    assert '[DEPRECATED]' in result.output


# --------------------------------------------------------------------------
# timeline --type offers interview, offer and denied only: note and
# feedback are refused by Typer itself (exit 2) before anything is sent.
# --------------------------------------------------------------------------


def _forbid_api_client(monkeypatch):
    """Replace the API client with one that records any construction, so a
    test can prove no request (GET included) was even attempted."""
    built = []

    def _client(*args, **kwargs):
        built.append(args)
        return FakeApiClient(*args, **kwargs)

    monkeypatch.setattr(applications_commands, 'ApiClient', _client)
    return built


@pytest.mark.parametrize('removed_type', ['note', 'feedback'])
def test_timeline_add_removed_type_refused_and_nothing_sent(
    monkeypatch, runner, removed_type
):
    _setup(monkeypatch)
    built = _forbid_api_client(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'add',
            '99',
            '--type',
            removed_type,
            '--date',
            '2026-06-01',
        ],
    )

    assert result.exit_code == 2
    assert f"'{removed_type}' is not one of" in result.output
    assert "'interview', 'offer', 'denied'" in result.output
    assert built == []
    assert FakeApiClient.captured_post_payload is None


@pytest.mark.parametrize('removed_type', ['note', 'feedback'])
def test_timeline_edit_removed_type_refused_and_nothing_sent(
    monkeypatch, runner, removed_type
):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': [_interview_event()]}
    built = _forbid_api_client(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'timeline',
            'edit',
            '99',
            '700',
            '--type',
            removed_type,
        ],
    )

    assert result.exit_code == 2
    assert f"'{removed_type}' is not one of" in result.output
    assert built == []
    assert FakeApiClient.captured_put_payload is None


@pytest.mark.parametrize('subcommand', ['add', 'edit'])
def test_timeline_help_lists_only_the_three_event_types(
    monkeypatch, runner, subcommand
):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        ['applications', 'timeline', subcommand, '--help'],
    )

    assert result.exit_code == 0
    assert '[interview|offer|denied]' in result.output
    assert 'interview, offer, denied' in result.output
    assert 'feedback' not in result.output.lower()
    # 'notes' (the --observation help) is fine; the event type 'note' is not.
    assert re.search(r'\bnote\b', result.output, re.IGNORECASE) is None


def test_timeline_group_help_names_the_three_event_types(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(app, ['applications', 'timeline', '--help'])

    assert result.exit_code == 0
    assert 'interviews, offers and denials' in result.output
    assert re.search(r'\bnotes?\b', result.output, re.IGNORECASE) is None
