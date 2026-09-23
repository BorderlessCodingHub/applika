"""``applications new|edit --file`` and the job-description options
(KODI-018)."""

from __future__ import annotations

import json

import yaml
from conftest import FakeApiClient, FakeStore, make_session, reset_fake_client

import applika.app as cli_app
import applika.commands.applications.commands as applications_commands
from applika.app import app

SUPPORTS = {
    'platforms': [{'id': '10', 'name': 'LinkedIn'}],
    'steps': [],
    'feedbacks': [],
}
CREATED = {
    'id': '1',
    'company_name': 'Acme',
    'role': 'Engineer',
    'application_date': '2026-05-08',
}
EXISTING = {
    'id': '1',
    'company_id': '55',
    'company_name': 'Acme',
    'role': 'Engineer',
    'mode': 'active',
    'platform_id': '10',
    'application_date': '2026-05-08',
    'link_to_job': None,
    'observation': 'old note',
    'expected_salary': None,
    'salary_range_min': None,
    'salary_range_max': None,
    'currency': None,
    'salary_period': None,
    'experience_level': None,
    'work_mode': None,
    'country': 'Brazil',
    'job_description': 'stored description',
    'salary_offer': None,
    'finalized_at': None,
    'finalized': False,
    'last_step': None,
    'feedback': None,
}
FILE_PAYLOAD = {
    'company': '55',
    'role': 'Platform Engineer',
    'mode': 'active',
    'platform_id': '10',
    'application_date': '2026-05-08',
    'country': 'Brazil',
}


def _setup(monkeypatch):
    store = FakeStore(make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_client()
    monkeypatch.setattr(applications_commands, 'ApiClient', FakeApiClient)
    FakeApiClient.supports = SUPPORTS
    FakeApiClient.created_response = CREATED
    FakeApiClient.updated_response = CREATED
    FakeApiClient.applications = [EXISTING]
    return store


def _file(tmp_path, payload, name='app.json'):
    path = tmp_path / name
    if name.endswith('.json'):
        path.write_text(json.dumps(payload))
    else:
        path.write_text(yaml.safe_dump(payload))
    return str(path)


# --- new --file ----------------------------------------------------------


def test_new_from_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    result = runner.invoke(
        app, ['applications', 'new', '--file', _file(tmp_path, FILE_PAYLOAD)]
    )
    assert result.exit_code == 0
    payload = FakeApiClient.captured_post_payload
    assert payload['company'] == '55'
    assert payload['role'] == 'Platform Engineer'
    assert payload['platform_id'] == '10'
    assert payload['country'] == 'Brazil'
    assert 'job_description' not in payload


def test_new_from_yaml_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    path = _file(tmp_path, FILE_PAYLOAD, name='app.yaml')
    result = runner.invoke(app, ['applications', 'new', '--file', path])
    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['role'] == 'Platform Engineer'


def test_new_from_stdin(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        ['applications', 'new', '--file', '-'],
        input=json.dumps(FILE_PAYLOAD),
    )
    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['role'] == 'Platform Engineer'


def test_new_file_resolves_a_company_name(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeApiClient.company_matches = [{'id': '77', 'name': 'Acme'}]
    payload = {**FILE_PAYLOAD, 'company': 'Acme'}
    result = runner.invoke(
        app, ['applications', 'new', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['company'] == '77'


def test_new_file_accepts_a_company_object(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {
        **FILE_PAYLOAD,
        'company': {'name': 'Newco', 'url': 'https://newco.example'},
    }
    result = runner.invoke(
        app, ['applications', 'new', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['company']['name'] == 'Newco'


def test_new_file_is_exclusive_with_named_options(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--file',
            _file(tmp_path, FILE_PAYLOAD),
            '--role',
            'Other',
        ],
    )
    assert result.exit_code == 2
    assert '--role' in result.output
    assert FakeApiClient.captured_post_payload is None


def test_new_file_missing_required_key(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {
        key: value for key, value in FILE_PAYLOAD.items() if key != 'role'
    }
    result = runner.invoke(
        app, ['applications', 'new', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 2
    assert 'role' in result.output


def test_new_file_unknown_key(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {**FILE_PAYLOAD, 'nope': 1}
    result = runner.invoke(
        app, ['applications', 'new', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 2
    assert 'unknown field' in result.output


def test_new_without_file_or_options_lists_what_is_missing(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['applications', 'new'])
    assert result.exit_code == 2
    for option in ('--company', '--role', '--platform', '--mode', '--date'):
        assert option in result.output
    assert '--file' in result.output


def test_new_with_the_named_options_still_works(monkeypatch, runner):
    """The 0.1.4 invocation, unchanged."""
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--company',
            'Acme',
            '--role',
            'Engineer',
            '--platform',
            'LinkedIn',
            '--mode',
            'active',
            '--date',
            '2026-05-08',
        ],
    )
    assert result.exit_code == 0
    payload = FakeApiClient.captured_post_payload
    assert payload['role'] == 'Engineer'
    assert 'job_description' not in payload


# --- job description on new ---------------------------------------------


def test_new_job_description_option(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--file',
            _file(tmp_path, FILE_PAYLOAD),
            '--job-description',
            'We need a backend engineer.',
        ],
    )
    assert result.exit_code == 0
    assert FakeApiClient.captured_post_payload['job_description'] == (
        'We need a backend engineer.'
    )


def test_new_job_description_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    description = tmp_path / 'jd.md'
    description.write_text('# Role\n\nBackend.\n')
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--file',
            _file(tmp_path, FILE_PAYLOAD),
            '--job-description-file',
            str(description),
        ],
    )
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_post_payload['job_description']
        == '# Role\n\nBackend.\n'
    )


def test_new_job_description_in_the_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {**FILE_PAYLOAD, 'job_description': 'From the file'}
    result = runner.invoke(
        app, ['applications', 'new', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_post_payload['job_description']
        == 'From the file'
    )


def test_new_job_description_option_overrides_the_file(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    payload = {**FILE_PAYLOAD, 'job_description': 'From the file'}
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--file',
            _file(tmp_path, payload),
            '--job-description',
            'From the option',
        ],
    )
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_post_payload['job_description']
        == 'From the option'
    )


def test_new_job_description_and_file_are_exclusive(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    description = tmp_path / 'jd.md'
    description.write_text('x')
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--file',
            _file(tmp_path, FILE_PAYLOAD),
            '--job-description',
            'a',
            '--job-description-file',
            str(description),
        ],
    )
    assert result.exit_code == 2
    assert 'not both' in result.output


def test_new_job_description_with_the_named_options(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        [
            'applications',
            'new',
            '--company',
            'Acme',
            '--role',
            'Engineer',
            '--platform',
            'LinkedIn',
            '--mode',
            'active',
            '--date',
            '2026-05-08',
            '--job-description',
            'Named path too.',
        ],
    )
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_post_payload['job_description']
        == 'Named path too.'
    )


# --- edit --file ---------------------------------------------------------


def test_edit_from_file_is_partial(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    path = _file(tmp_path, {'role': 'Staff Engineer'})
    result = runner.invoke(app, ['applications', 'edit', '1', '--file', path])
    assert result.exit_code == 0
    payload = FakeApiClient.captured_put_payload
    assert payload['role'] == 'Staff Engineer'
    # Untouched keys keep their stored values.
    assert payload['observation'] == 'old note'
    assert payload['country'] == 'Brazil'
    assert payload['company'] == '55'
    # job_description is sticky on the API's PUT: never sent unasked.
    assert 'job_description' not in payload


def test_edit_file_is_exclusive_with_named_options(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    path = _file(tmp_path, {'role': 'Staff Engineer'})
    result = runner.invoke(
        app,
        ['applications', 'edit', '1', '--file', path, '--country', 'Portugal'],
    )
    assert result.exit_code == 2
    assert '--country' in result.output
    assert FakeApiClient.captured_put_payload is None


def test_edit_file_unknown_key(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    path = _file(tmp_path, {'nope': 1})
    result = runner.invoke(app, ['applications', 'edit', '1', '--file', path])
    assert result.exit_code == 2
    assert 'unknown field' in result.output


def test_edit_file_salary_without_currency_is_refused(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    path = _file(tmp_path, {'expected_salary': 1000})
    result = runner.invoke(app, ['applications', 'edit', '1', '--file', path])
    assert result.exit_code != 0
    assert FakeApiClient.captured_put_payload is None


def test_edit_job_description_option(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        ['applications', 'edit', '1', '--job-description', 'A new posting'],
    )
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_put_payload['job_description'] == 'A new posting'
    )


def test_edit_job_description_empty_string_clears_it(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app, ['applications', 'edit', '1', '--job-description', '']
    )
    assert result.exit_code == 0
    assert FakeApiClient.captured_put_payload['job_description'] is None


def test_edit_job_description_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    description = tmp_path / 'jd.txt'
    description.write_text('From a file')
    result = runner.invoke(
        app,
        [
            'applications',
            'edit',
            '1',
            '--job-description-file',
            str(description),
        ],
    )
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_put_payload['job_description'] == 'From a file'
    )


def test_edit_job_description_in_the_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    path = _file(tmp_path, {'job_description': 'Key in the file'})
    result = runner.invoke(app, ['applications', 'edit', '1', '--file', path])
    assert result.exit_code == 0
    assert (
        FakeApiClient.captured_put_payload['job_description']
        == 'Key in the file'
    )


def test_edit_without_job_description_leaves_it_alone(monkeypatch, runner):
    """The 0.1.4/0.2.0 edit, unchanged: no job_description key goes out."""
    _setup(monkeypatch)
    result = runner.invoke(
        app, ['applications', 'edit', '1', '--role', 'Staff Engineer']
    )
    assert result.exit_code == 0
    payload = FakeApiClient.captured_put_payload
    assert payload['role'] == 'Staff Engineer'
    assert 'job_description' not in payload


def test_edit_round_trips_an_application_entry(monkeypatch, runner, tmp_path):
    """``applications list --output-format json`` is a valid ``--file``."""
    _setup(monkeypatch)
    path = _file(tmp_path, EXISTING)
    result = runner.invoke(app, ['applications', 'edit', '1', '--file', path])
    assert result.exit_code == 0
    payload = FakeApiClient.captured_put_payload
    assert payload['company'] == '55'
    assert payload['role'] == 'Engineer'
    assert payload['job_description'] == 'stored description'
    assert 'finalized' not in payload
    assert 'last_step' not in payload
