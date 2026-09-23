"""``applika applications cv …`` - the CV copy commands (KODI-018)."""

from __future__ import annotations

import json

import pytest
import yaml
from conftest import FakeStore, make_session
from fakes_cv import (
    FakeCvClient,
    body_of,
    called,
    reset_fake_cv_client,
    sample_tailored_cv,
)

import applika.app as cli_app
import applika.commands.applications.cv as cv_commands
from applika.app import app
from applika.lib.api import ApiError

CV_PATH = '/applications/1/cv'
MARKDOWN = b'# Ada Lovelace\n'
DIFF_MARKDOWN = b'- Backend Engineer\n+ Staff Engineer\n'


def _setup(monkeypatch):
    store = FakeStore(make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_cv_client()
    monkeypatch.setattr(cv_commands, 'ApiClient', FakeCvClient)
    return store


def _file(tmp_path, payload, name='edits.json'):
    path = tmp_path / name
    if name.endswith('.json'):
        path.write_text(json.dumps(payload))
    else:
        path.write_text(yaml.safe_dump(payload))
    return str(path)


# --- get -----------------------------------------------------------------


def test_cv_get_text(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    result = runner.invoke(app, ['applications', 'cv', 'get', '1'])
    assert result.exit_code == 0
    assert 'CV copy: id=950' in result.output
    assert 'application=1' in result.output
    assert 'base_cv=900' in result.output


def test_cv_get_markdown(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/markdown')] = (MARKDOWN, {})
    result = runner.invoke(
        app, ['applications', 'cv', 'get', '1', '--output', 'md']
    )
    assert result.exit_code == 0
    assert result.output == MARKDOWN.decode()


def test_cv_get_404_exits_1(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('GET', CV_PATH)] = ApiError('No CV copy', 404)
    result = runner.invoke(app, ['applications', 'cv', 'get', '1'])
    assert result.exit_code == 1
    assert 'No CV copy' in result.output


# --- create --------------------------------------------------------------


def test_cv_create_from_only_posts(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', CV_PATH)] = sample_tailored_cv()
    result = runner.invoke(
        app, ['applications', 'cv', 'create', '1', '--from', '900']
    )
    assert result.exit_code == 0
    assert body_of('POST', CV_PATH) == {'base_cv_id': '900'}
    assert not called('PUT', CV_PATH)
    assert 'Created CV copy: id=950' in result.output


def test_cv_create_applies_the_file_in_one_command(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv(
        headline='Staff Engineer'
    )
    path = _file(tmp_path, {'headline': 'Staff Engineer'})
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'create',
            '1',
            '--from',
            '900',
            '--file',
            path,
        ],
    )
    assert result.exit_code == 0
    body = body_of('PUT', CV_PATH)
    assert body['headline'] == 'Staff Engineer'
    # The PUT is a full replace: the whole document goes out, minus the
    # provenance keys the API forbids.
    assert body['full_name'] == 'Ada Lovelace'
    assert 'id' not in body
    assert 'base_cv_id' not in body
    assert 'base_snapshot' not in body
    assert 'was_ai_generated' not in body
    assert 'adjustments' not in body
    assert 'application_id' not in body


def test_cv_create_name_only_still_puts(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv(name='Acme')
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'create',
            '1',
            '--from',
            '900',
            '--name',
            'Acme',
        ],
    )
    assert result.exit_code == 0
    assert body_of('PUT', CV_PATH)['name'] == 'Acme'


def test_cv_create_requires_from(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['applications', 'cv', 'create', '1'])
    assert result.exit_code == 2


def test_cv_create_bad_file_never_creates_the_copy(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    path = _file(tmp_path, {'nope': 1})
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'create',
            '1',
            '--from',
            '900',
            '--file',
            path,
        ],
    )
    assert result.exit_code == 2
    assert 'unknown field' in result.output
    assert not called('POST', CV_PATH)


def test_cv_create_409_exits_1(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('POST', CV_PATH)] = ApiError(
        'This application already has a CV copy', 409
    )
    result = runner.invoke(
        app, ['applications', 'cv', 'create', '1', '--from', '900']
    )
    assert result.exit_code == 1
    assert 'already has a CV copy' in result.output


def test_cv_create_422_on_an_archived_application(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('POST', CV_PATH)] = ApiError(
        'The application is archived', 422
    )
    result = runner.invoke(
        app, ['applications', 'cv', 'create', '1', '--from', '900']
    )
    assert result.exit_code == 1
    assert 'archived' in result.output


# --- edit ----------------------------------------------------------------


def test_cv_edit_sends_the_whole_document(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    path = _file(tmp_path, {'summary': 'New summary'})
    result = runner.invoke(
        app, ['applications', 'cv', 'edit', '1', '--file', path]
    )
    assert result.exit_code == 0
    body = body_of('PUT', CV_PATH)
    assert body['summary'] == 'New summary'
    # Absent keys are left exactly as they were stored.
    assert body['headline'] == 'Backend Engineer'
    assert body['experience'][0]['id'] == 'e1'


def test_cv_edit_section_replaces_it_whole(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    path = _file(
        tmp_path,
        {'links': [{'label': 'Site', 'url': 'https://s'}]},
    )
    result = runner.invoke(
        app, ['applications', 'cv', 'edit', '1', '--file', path]
    )
    assert result.exit_code == 0
    links = body_of('PUT', CV_PATH)['links']
    assert len(links) == 1
    assert links[0]['label'] == 'Site'
    assert links[0]['id']


def test_cv_edit_name_only(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    result = runner.invoke(
        app, ['applications', 'cv', 'edit', '1', '--name', 'Acme tailored']
    )
    assert result.exit_code == 0
    assert body_of('PUT', CV_PATH)['name'] == 'Acme tailored'


def test_cv_edit_without_file_or_name_exits_2(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['applications', 'cv', 'edit', '1'])
    assert result.exit_code == 2
    assert not called('PUT', CV_PATH)


def test_cv_edit_409_on_a_closed_application(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.errors[('PUT', CV_PATH)] = ApiError(
        'The application is closed', 409
    )
    result = runner.invoke(
        app, ['applications', 'cv', 'edit', '1', '--name', 'x']
    )
    assert result.exit_code == 1
    assert 'closed' in result.output


def test_cv_edit_round_trips_get_output_json(monkeypatch, runner, tmp_path):
    """``applications cv get --output json`` is a valid ``--file``: the
    provenance keys the PUT forbids are dropped on the way back in."""
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    exported = runner.invoke(
        app, ['applications', 'cv', 'get', '1', '--output', 'json']
    )
    assert exported.exit_code == 0

    reset_fake_cv_client()
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    path = tmp_path / 'copy.json'
    path.write_text(exported.output)
    result = runner.invoke(
        app, ['applications', 'cv', 'edit', '1', '--file', str(path)]
    )
    assert result.exit_code == 0
    body = body_of('PUT', CV_PATH)
    for forbidden in (
        'id',
        'application_id',
        'base_cv_id',
        'was_ai_generated',
        'adjustments',
        'base_snapshot',
        'created_at',
        'updated_at',
    ):
        assert forbidden not in body
    assert body['email'] == 'ada@example.com'


def test_cv_edit_reads_stdin(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    result = runner.invoke(
        app,
        ['applications', 'cv', 'edit', '1', '--file', '-'],
        input=json.dumps({'headline': 'From stdin'}),
    )
    assert result.exit_code == 0
    assert body_of('PUT', CV_PATH)['headline'] == 'From stdin'


# --- delete --------------------------------------------------------------


def test_cv_delete_with_yes(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('DELETE', CV_PATH)] = None
    result = runner.invoke(app, ['applications', 'cv', 'delete', '1', '--yes'])
    assert result.exit_code == 0
    assert called('DELETE', CV_PATH)


def test_cv_delete_asks_for_confirmation(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app, ['applications', 'cv', 'delete', '1'], input='n\n'
    )
    assert result.exit_code == 0
    assert not called('DELETE', CV_PATH)


# --- download ------------------------------------------------------------


def test_cv_download_pdf(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('POST', f'{CV_PATH}/pdf')] = (
        b'%PDF',
        {'Content-Disposition': 'attachment; filename="acme-cv.pdf"'},
    )
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'download',
            '1',
            '--type',
            'pdf',
            '--dir',
            str(tmp_path),
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'acme-cv.pdf').read_bytes() == b'%PDF'


def test_cv_download_md_with_filename(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/markdown')] = (MARKDOWN, {})
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'download',
            '1',
            '--type',
            'md',
            '--dir',
            str(tmp_path),
            '--filename',
            'copy',
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'copy.md').read_bytes() == MARKDOWN


def test_cv_download_requires_type(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['applications', 'cv', 'download', '1'])
    assert result.exit_code == 2


def test_cv_download_refuses_to_overwrite(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/markdown')] = (MARKDOWN, {})
    (tmp_path / 'copy.md').write_bytes(b'old')
    args = [
        'applications',
        'cv',
        'download',
        '1',
        '--type',
        'md',
        '--dir',
        str(tmp_path),
        '--filename',
        'copy.md',
    ]
    assert runner.invoke(app, args).exit_code == 2
    assert runner.invoke(app, [*args, '--force']).exit_code == 0
    assert (tmp_path / 'copy.md').read_bytes() == MARKDOWN


# --- diff ----------------------------------------------------------------


def test_cv_diff_md_writes_a_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/diff/markdown')] = (
        DIFF_MARKDOWN,
        {'Content-Disposition': 'attachment; filename="diff.md"'},
    )
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'diff',
            '1',
            '--type',
            'md',
            '--dir',
            str(tmp_path),
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'diff.md').read_bytes() == DIFF_MARKDOWN


def test_cv_diff_print_goes_to_stdout(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/diff/markdown')] = (
        DIFF_MARKDOWN,
        {},
    )
    result = runner.invoke(
        app,
        ['applications', 'cv', 'diff', '1', '--type', 'md', '--print'],
    )
    assert result.exit_code == 0
    assert result.output == DIFF_MARKDOWN.decode()
    assert list(tmp_path.iterdir()) == []


def test_cv_diff_print_needs_md(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app,
        ['applications', 'cv', 'diff', '1', '--type', 'pdf', '--print'],
    )
    assert result.exit_code == 2
    assert '--print is only valid with --type md' in result.output


def test_cv_diff_pdf(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/diff/pdf')] = (b'%PDF', {})
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'diff',
            '1',
            '--type',
            'pdf',
            '--dir',
            str(tmp_path),
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'application-1-cv-diff.pdf').read_bytes() == b'%PDF'


def test_cv_diff_409_says_nothing_to_compare_against(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('GET', f'{CV_PATH}/diff/markdown')] = ApiError(
        'This CV copy has no baseline', 409
    )
    result = runner.invoke(
        app, ['applications', 'cv', 'diff', '1', '--type', 'md', '--print']
    )
    assert result.exit_code == 1
    assert 'nothing to compare against' in result.output
    assert 'no baseline' in result.output


def test_cv_diff_requires_type(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['applications', 'cv', 'diff', '1'])
    assert result.exit_code == 2


@pytest.mark.parametrize(
    'args',
    [
        ['applications', 'cv', 'get', '1'],
        ['applications', 'cv', 'delete', '1', '--yes'],
    ],
)
def test_cv_requires_a_session(monkeypatch, runner, args):
    store = FakeStore(None)
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_cv_client()
    monkeypatch.setattr(cv_commands, 'ApiClient', FakeCvClient)
    result = runner.invoke(app, args)
    assert result.exit_code != 0
    assert 'applika login' in str(result.exception)


# --- backend-qa round 1 -------------------------------------------------


def test_cv_create_output_md_calls_the_markdown_route(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/markdown')] = (MARKDOWN, {})
    path = _file(tmp_path, {'headline': 'Staff Engineer'})
    result = runner.invoke(
        app,
        [
            'applications',
            'cv',
            'create',
            '1',
            '--from',
            '900',
            '--file',
            path,
            '--output',
            'md',
        ],
    )
    assert result.exit_code == 0
    assert result.output == MARKDOWN.decode()
    assert called('GET', f'{CV_PATH}/markdown')


def test_cv_edit_output_md_calls_the_markdown_route(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.responses[('PUT', CV_PATH)] = sample_tailored_cv()
    FakeCvClient.raw_responses[('GET', f'{CV_PATH}/markdown')] = (MARKDOWN, {})
    result = runner.invoke(
        app,
        ['applications', 'cv', 'edit', '1', '--name', 'Acme', '--output', 'md'],
    )
    assert result.exit_code == 0
    assert result.output == MARKDOWN.decode()


def test_cv_name_over_200_is_a_local_error(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(
        app, ['applications', 'cv', 'edit', '1', '--name', 'x' * 201]
    )
    assert result.exit_code == 2
    assert not called('PUT', CV_PATH)
