"""KODI-013: applika-cli 0.2.0 - timeline commands, finalize --outcome and
reopen. New tests only; the 0.1.4 tests in test_commands.py are untouched."""

import json

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
                'event_type': 'note',
                'interview_type': None,
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
                'event_type': 'note',
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

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'list', '99', '--output-format', 'json'],
    )

    assert result.exit_code == 0
    assert json.loads(result.output)[0]['id'] == '700'


# --------------------------------------------------------------------------
# applications timeline add
# --------------------------------------------------------------------------


def test_timeline_add_note_builds_matching_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.event_created_response = {
        'id': '700',
        'event_type': 'note',
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
            'note',
            '--date',
            '2026-06-01',
            '--observation',
            'Applied via referral',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/timeline'
    assert FakeApiClient.captured_post_payload == {
        'event_type': 'note',
        'interview_type': None,
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
            'note',
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
            'note',
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
            'note',
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
            'note',
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
        'event_date': '2026-06-10',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': 180000.0,
        'salary_currency': 'USD',
        'salary_period': 'annually',
    }


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
            'note',
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
        'event_type': 'note',
        'event_date': '2026-06-05',
    }

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'edit', '99', '700', '--type', 'note'],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_path == '/applications/99/timeline/700'
    assert FakeApiClient.captured_put_payload == {
        'event_type': 'note',
        'interview_type': None,
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
    note_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'note',
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
    FakeApiClient.timeline_events = {'99': [note_event]}
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
    note_event = {
        'id': '700',
        'application_id': '99',
        'user_id': '1',
        'event_type': 'note',
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
    FakeApiClient.timeline_events = {'99': [note_event]}

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
        'event_date': '2026-06-05',
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': 'Updated note',
        'salary_amount': 5000.0,
        'salary_currency': 'USD',
        'salary_period': 'monthly',
    }


def test_timeline_edit_not_found_reports_clean_error(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.timeline_events = {'99': []}

    result = runner.invoke(
        app,
        ['applications', 'timeline', 'edit', '99', '999', '--type', 'note'],
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
        'last_step': None,
        'feedback': None,
    }

    result = runner.invoke(app, ['applications', 'finalize', '99'])

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/finalize'
    assert FakeApiClient.captured_post_payload is None


def test_finalize_outcome_offer_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': 9000.0,
        'last_step': {'name': 'Offer', 'date': '2026-06-10'},
        'feedback': None,
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
    }


def test_finalize_outcome_denied_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': None,
        'last_step': {'name': 'Denied', 'date': '2026-06-10'},
        'feedback': None,
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
    }


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
    }

    first = runner.invoke(app, ['applications', 'finalize', '99'])
    second = runner.invoke(app, ['applications', 'finalize', '99'])

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert first.output == second.output


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
    }

    first = runner.invoke(app, ['applications', 'reopen', '99'])
    assert FakeApiClient.captured_post_payload is None
    second = runner.invoke(app, ['applications', 'reopen', '99'])

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/reopen'
    assert 'Reopened application: id=99' in first.output
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
