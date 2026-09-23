"""``applika cvs …`` - the master CV commands (KODI-018)."""

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
    sample_cv,
)

import applika.app as cli_app
import applika.commands.cvs.commands as cvs_commands
from applika.app import app
from applika.lib.api import ApiError

MINIMAL = {
    'name': 'Backend CV',
    'full_name': 'Ada Lovelace',
    'headline': 'Backend Engineer',
    'location': 'Lisbon',
    'email': 'ada@example.com',
}
MARKDOWN = b'# Ada Lovelace\n\nBackend Engineer\n'


def _setup(monkeypatch):
    store = FakeStore(make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_cv_client()
    monkeypatch.setattr(cvs_commands, 'ApiClient', FakeCvClient)
    return store


def _file(tmp_path, payload, name='cv.json'):
    path = tmp_path / name
    if name.endswith('.json'):
        path.write_text(json.dumps(payload))
    else:
        path.write_text(yaml.safe_dump(payload))
    return str(path)


# --- list ----------------------------------------------------------------


def test_cvs_list_table(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs')] = [sample_cv()]
    result = runner.invoke(app, ['cvs', 'list'])
    assert result.exit_code == 0
    assert 'id' in result.output
    assert 'headline' in result.output
    assert '900' in result.output
    assert 'Backend Engineer' in result.output


def test_cvs_list_json(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs')] = [sample_cv()]
    result = runner.invoke(app, ['cvs', 'list', '--output', 'json'])
    assert result.exit_code == 0
    assert json.loads(result.output)[0]['id'] == '900'


def test_cvs_list_yaml(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs')] = [sample_cv()]
    result = runner.invoke(app, ['cvs', 'list', '--output', 'yaml'])
    assert result.exit_code == 0
    assert yaml.safe_load(result.output)[0]['name'] == 'Backend CV'


def test_cvs_list_markdown_table(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs')] = [sample_cv()]
    result = runner.invoke(app, ['cvs', 'list', '--output', 'md'])
    assert result.exit_code == 0
    lines = [line for line in result.output.splitlines() if line.strip()]
    assert lines[0] == '| id | name | headline | updated |'
    assert lines[1] == '| --- | --- | --- | --- |'
    assert lines[2] == (
        '| 900 | Backend CV | Backend Engineer | 2026-09-21T10:00:00Z |'
    )


def test_cvs_list_api_error_exits_1(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('GET', '/base-cvs')] = ApiError('boom', 500)
    result = runner.invoke(app, ['cvs', 'list'])
    assert result.exit_code == 1
    assert 'boom' in result.output


# --- get -----------------------------------------------------------------


def test_cvs_get_text(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    result = runner.invoke(app, ['cvs', 'get', '900'])
    assert result.exit_code == 0
    assert 'CV: id=900' in result.output
    assert 'sections: links=1' in result.output


def test_cvs_get_markdown_comes_from_the_server(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.raw_responses[('GET', '/base-cvs/900/markdown')] = (
        MARKDOWN,
        {},
    )
    result = runner.invoke(app, ['cvs', 'get', '900', '--output', 'md'])
    assert result.exit_code == 0
    assert result.output == MARKDOWN.decode()
    assert called('GET', '/base-cvs/900/markdown')


def test_cvs_get_404_exits_1(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('GET', '/base-cvs/404')] = ApiError(
        'CV not found', 404
    )
    result = runner.invoke(app, ['cvs', 'get', '404'])
    assert result.exit_code == 1
    assert 'CV not found' in result.output


# --- create --------------------------------------------------------------


def test_cvs_create_sends_the_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', '/base-cvs')] = sample_cv()
    result = runner.invoke(
        app, ['cvs', 'create', '--file', _file(tmp_path, MINIMAL)]
    )
    assert result.exit_code == 0
    assert body_of('POST', '/base-cvs') == MINIMAL
    assert 'Created CV: id=900' in result.output


def test_cvs_create_from_yaml(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', '/base-cvs')] = sample_cv()
    path = _file(tmp_path, MINIMAL, name='cv.yaml')
    result = runner.invoke(app, ['cvs', 'create', '--file', path])
    assert result.exit_code == 0
    assert body_of('POST', '/base-cvs') == MINIMAL


def test_cvs_create_name_overrides_the_file(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', '/base-cvs')] = sample_cv()
    result = runner.invoke(
        app,
        [
            'cvs',
            'create',
            '--file',
            _file(tmp_path, MINIMAL),
            '--name',
            'Override',
        ],
    )
    assert result.exit_code == 0
    assert body_of('POST', '/base-cvs')['name'] == 'Override'


def test_cvs_create_requires_a_name(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {key: value for key, value in MINIMAL.items() if key != 'name'}
    result = runner.invoke(
        app, ['cvs', 'create', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 2
    assert 'name' in result.output
    assert not called('POST', '/base-cvs')


def test_cvs_create_missing_required_field(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {key: value for key, value in MINIMAL.items() if key != 'email'}
    result = runner.invoke(
        app, ['cvs', 'create', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 2
    assert 'email' in result.output


def test_cvs_create_unknown_key_exits_2(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    payload = {**MINIMAL, 'nope': 1}
    result = runner.invoke(
        app, ['cvs', 'create', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 2
    assert 'unknown field' in result.output
    assert not called('POST', '/base-cvs')


def test_cvs_create_409_exits_1(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.errors[('POST', '/base-cvs')] = ApiError('At most 3 CVs', 409)
    result = runner.invoke(
        app, ['cvs', 'create', '--file', _file(tmp_path, MINIMAL)]
    )
    assert result.exit_code == 1
    assert 'At most 3 CVs' in result.output


def test_cvs_create_generates_item_ids(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', '/base-cvs')] = sample_cv()
    payload = {
        **MINIMAL,
        'languages': [
            {'name': 'English', 'level': 'C2'},
            {'id': 'mine', 'name': 'Portuguese', 'level': 'Native'},
        ],
    }
    result = runner.invoke(
        app, ['cvs', 'create', '--file', _file(tmp_path, payload)]
    )
    assert result.exit_code == 0
    languages = body_of('POST', '/base-cvs')['languages']
    assert languages[0]['id']
    assert languages[1]['id'] == 'mine'


def test_cvs_create_reads_stdin(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', '/base-cvs')] = sample_cv()
    result = runner.invoke(
        app,
        ['cvs', 'create', '--file', '-'],
        input=json.dumps(MINIMAL),
    )
    assert result.exit_code == 0
    assert body_of('POST', '/base-cvs') == MINIMAL


def test_cvs_create_output_md_calls_the_markdown_route(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.responses[('POST', '/base-cvs')] = sample_cv()
    FakeCvClient.raw_responses[('GET', '/base-cvs/900/markdown')] = (
        MARKDOWN,
        {},
    )
    result = runner.invoke(
        app,
        [
            'cvs',
            'create',
            '--file',
            _file(tmp_path, MINIMAL),
            '--output',
            'md',
        ],
    )
    assert result.exit_code == 0
    assert result.output == MARKDOWN.decode()


# --- edit ----------------------------------------------------------------


def test_cvs_edit_patches_only_the_keys_given(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.responses[('PATCH', '/base-cvs/900')] = sample_cv(
        headline='Staff Engineer'
    )
    path = _file(tmp_path, {'headline': 'Staff Engineer'})
    result = runner.invoke(app, ['cvs', 'edit', '900', '--file', path])
    assert result.exit_code == 0
    assert body_of('PATCH', '/base-cvs/900') == {'headline': 'Staff Engineer'}


def test_cvs_edit_section_replaces_it_whole(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.responses[('PATCH', '/base-cvs/900')] = sample_cv()
    path = _file(
        tmp_path,
        {'links': [{'id': 'new', 'label': 'Site', 'url': 'https://s'}]},
    )
    result = runner.invoke(app, ['cvs', 'edit', '900', '--file', path])
    assert result.exit_code == 0
    body = body_of('PATCH', '/base-cvs/900')
    assert list(body) == ['links']
    assert body['links'] == [{'id': 'new', 'label': 'Site', 'url': 'https://s'}]


def test_cvs_edit_name_only(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.responses[('PATCH', '/base-cvs/900')] = sample_cv(name='New')
    result = runner.invoke(app, ['cvs', 'edit', '900', '--name', 'New'])
    assert result.exit_code == 0
    assert body_of('PATCH', '/base-cvs/900') == {'name': 'New'}


def test_cvs_edit_without_file_or_name_exits_2(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['cvs', 'edit', '900'])
    assert result.exit_code == 2
    assert '--file' in result.output
    assert not called('PATCH', '/base-cvs/900')


def test_cvs_edit_clears_phone_with_an_explicit_null(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.responses[('PATCH', '/base-cvs/900')] = sample_cv()
    path = _file(tmp_path, {'phone': None})
    result = runner.invoke(app, ['cvs', 'edit', '900', '--file', path])
    assert result.exit_code == 0
    assert body_of('PATCH', '/base-cvs/900') == {'phone': None}


def test_cvs_edit_round_trips_a_get_json_response(
    monkeypatch, runner, tmp_path
):
    """The spec's round trip: ``get --output json`` output is a valid
    ``--file`` for ``edit``, read-only keys and all."""
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    result = runner.invoke(app, ['cvs', 'get', '900', '--output', 'json'])
    assert result.exit_code == 0

    reset_fake_cv_client()
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.responses[('PATCH', '/base-cvs/900')] = sample_cv()
    path = tmp_path / 'round.json'
    path.write_text(result.output)
    again = runner.invoke(app, ['cvs', 'edit', '900', '--file', str(path)])
    assert again.exit_code == 0
    body = body_of('PATCH', '/base-cvs/900')
    assert 'id' not in body
    assert 'created_at' not in body
    assert body['headline'] == 'Backend Engineer'
    assert body['experience'][0]['id'] == 'e1'


def test_cvs_edit_round_trips_yaml(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    result = runner.invoke(app, ['cvs', 'get', '900', '--output', 'yaml'])
    assert result.exit_code == 0

    reset_fake_cv_client()
    FakeCvClient.responses[('GET', '/base-cvs/900')] = sample_cv()
    FakeCvClient.responses[('PATCH', '/base-cvs/900')] = sample_cv()
    path = tmp_path / 'round.yaml'
    path.write_text(result.output)
    again = runner.invoke(app, ['cvs', 'edit', '900', '--file', str(path)])
    assert again.exit_code == 0
    assert body_of('PATCH', '/base-cvs/900')['full_name'] == 'Ada Lovelace'


def test_cvs_edit_bad_date_exits_2_without_sending(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    path = _file(
        tmp_path,
        {
            'experience': [
                {
                    'company': 'Acme',
                    'role': 'Dev',
                    'start': '2021-05',
                    'end': '2020-01',
                }
            ]
        },
    )
    result = runner.invoke(app, ['cvs', 'edit', '900', '--file', path])
    assert result.exit_code == 2
    assert 'earlier than start' in result.output
    assert not called('PATCH', '/base-cvs/900')


# --- delete --------------------------------------------------------------


def test_cvs_delete_with_yes(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.responses[('DELETE', '/base-cvs/900')] = None
    result = runner.invoke(app, ['cvs', 'delete', '900', '--yes'])
    assert result.exit_code == 0
    assert called('DELETE', '/base-cvs/900')
    assert 'Deleted master CV 900' in result.output


def test_cvs_delete_asks_for_confirmation(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['cvs', 'delete', '900'], input='n\n')
    assert result.exit_code == 0
    assert not called('DELETE', '/base-cvs/900')
    assert 'Aborted.' in result.output


def test_cvs_delete_404_exits_1(monkeypatch, runner):
    _setup(monkeypatch)
    FakeCvClient.errors[('DELETE', '/base-cvs/900')] = ApiError('gone', 404)
    result = runner.invoke(app, ['cvs', 'delete', '900', '--yes'])
    assert result.exit_code == 1
    assert 'gone' in result.output


# --- download ------------------------------------------------------------


def _raw(headers=None):
    return (b'%PDF-1.4 fake', headers or {})


def test_cvs_download_pdf_uses_post_and_the_server_name(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('POST', '/base-cvs/900/pdf')] = _raw({
        'Content-Disposition': 'attachment; filename="backend-cv.pdf"'
    })
    result = runner.invoke(
        app,
        ['cvs', 'download', '900', '--type', 'pdf', '--dir', str(tmp_path)],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'backend-cv.pdf').read_bytes() == b'%PDF-1.4 fake'


def test_cvs_download_md_uses_get(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('GET', '/base-cvs/900/markdown')] = (
        MARKDOWN,
        {'Content-Disposition': 'attachment; filename="backend-cv.md"'},
    )
    result = runner.invoke(
        app,
        ['cvs', 'download', '900', '--type', 'md', '--dir', str(tmp_path)],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'backend-cv.md').read_bytes() == MARKDOWN


def test_cvs_download_requires_type(monkeypatch, runner):
    _setup(monkeypatch)
    result = runner.invoke(app, ['cvs', 'download', '900'])
    assert result.exit_code == 2


def test_cvs_download_filename_gets_the_extension(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('POST', '/base-cvs/900/pdf')] = _raw()
    result = runner.invoke(
        app,
        [
            'cvs',
            'download',
            '900',
            '--type',
            'pdf',
            '--dir',
            str(tmp_path),
            '--filename',
            'ada',
        ],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'ada.pdf').exists()


def test_cvs_download_creates_the_directory(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('POST', '/base-cvs/900/pdf')] = _raw()
    target = tmp_path / 'made' / 'up'
    result = runner.invoke(
        app,
        [
            'cvs',
            'download',
            '900',
            '--type',
            'pdf',
            '--dir',
            str(target),
            '--filename',
            'ada.pdf',
        ],
    )
    assert result.exit_code == 0
    assert (target / 'ada.pdf').exists()


def test_cvs_download_refuses_to_overwrite_without_force(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('POST', '/base-cvs/900/pdf')] = _raw()
    (tmp_path / 'ada.pdf').write_bytes(b'old')
    args = [
        'cvs',
        'download',
        '900',
        '--type',
        'pdf',
        '--dir',
        str(tmp_path),
        '--filename',
        'ada.pdf',
    ]
    result = runner.invoke(app, args)
    assert result.exit_code == 2
    assert 'already exists' in result.output
    assert (tmp_path / 'ada.pdf').read_bytes() == b'old'

    forced = runner.invoke(app, [*args, '--force'])
    assert forced.exit_code == 0
    assert (tmp_path / 'ada.pdf').read_bytes() == b'%PDF-1.4 fake'


def test_cvs_download_fallback_name_without_a_header(
    monkeypatch, runner, tmp_path
):
    _setup(monkeypatch)
    FakeCvClient.raw_responses[('POST', '/base-cvs/900/pdf')] = _raw()
    result = runner.invoke(
        app,
        ['cvs', 'download', '900', '--type', 'pdf', '--dir', str(tmp_path)],
    )
    assert result.exit_code == 0
    assert (tmp_path / 'cv-900.pdf').exists()


def test_cvs_download_api_error_exits_1(monkeypatch, runner, tmp_path):
    _setup(monkeypatch)
    FakeCvClient.errors[('POST', '/base-cvs/900/pdf')] = ApiError(
        'render failed', 500
    )
    result = runner.invoke(
        app,
        ['cvs', 'download', '900', '--type', 'pdf', '--dir', str(tmp_path)],
    )
    assert result.exit_code == 1
    assert 'render failed' in result.output


@pytest.mark.parametrize(
    'args',
    [
        ['cvs', 'list'],
        ['cvs', 'get', '900'],
        ['cvs', 'delete', '900', '--yes'],
    ],
)
def test_cvs_requires_a_session(monkeypatch, runner, args):
    store = FakeStore(None)
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_cv_client()
    monkeypatch.setattr(cvs_commands, 'ApiClient', FakeCvClient)
    result = runner.invoke(app, args)
    assert result.exit_code != 0
    assert 'applika login' in str(result.exception)
