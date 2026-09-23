"""``--file`` loading, local validation and download naming (KODI-018)."""

from __future__ import annotations

import io
import json

import pytest

from applika.lib.cv_file import (
    FileInputError,
    load_payload_file,
    read_text_file,
    validate_cv_document,
)
from applika.lib.download import (
    filename_from_headers,
    resolve_target,
    with_extension,
)
from applika.schemas.enums import DownloadType

MINIMAL = {
    'name': 'CV',
    'full_name': 'Ada Lovelace',
    'headline': 'Backend Engineer',
    'location': 'Lisbon',
    'email': 'ada@example.com',
}


def write(tmp_path, name, payload, *, raw=None):
    path = tmp_path / name
    path.write_text(raw if raw is not None else json.dumps(payload))
    return str(path)


# --- loading -------------------------------------------------------------


def test_json_file_is_loaded(tmp_path):
    path = write(tmp_path, 'cv.json', MINIMAL)
    assert load_payload_file(path) == MINIMAL


@pytest.mark.parametrize('suffix', ['yaml', 'yml'])
def test_yaml_file_is_loaded(tmp_path, suffix):
    raw = 'name: CV\nfull_name: Ada Lovelace\n'
    path = write(tmp_path, f'cv.{suffix}', None, raw=raw)
    assert load_payload_file(path) == {
        'name': 'CV',
        'full_name': 'Ada Lovelace',
    }


def test_unknown_extension_is_refused(tmp_path):
    path = write(tmp_path, 'cv.txt', MINIMAL)
    with pytest.raises(FileInputError, match='.json, .yaml or .yml'):
        load_payload_file(path)


def test_missing_file_is_refused(tmp_path):
    with pytest.raises(FileInputError, match='not found'):
        load_payload_file(str(tmp_path / 'nope.json'))


def test_stdin_sniffs_json(monkeypatch):
    monkeypatch.setattr('sys.stdin', io.StringIO(json.dumps(MINIMAL)))
    assert load_payload_file('-') == MINIMAL


def test_stdin_sniffs_yaml(monkeypatch):
    monkeypatch.setattr('sys.stdin', io.StringIO('name: CV\n'))
    assert load_payload_file('-') == {'name': 'CV'}


def test_empty_stdin_is_refused(monkeypatch):
    monkeypatch.setattr('sys.stdin', io.StringIO('   '))
    with pytest.raises(FileInputError, match='No data on stdin'):
        load_payload_file('-')


def test_non_mapping_is_refused(tmp_path):
    path = write(tmp_path, 'cv.json', ['a'])
    with pytest.raises(FileInputError, match='object/mapping'):
        load_payload_file(path)


def test_broken_json_is_refused(tmp_path):
    path = write(tmp_path, 'cv.json', None, raw='{')
    with pytest.raises(FileInputError, match='not valid JSON'):
        load_payload_file(path)


def test_read_text_file(tmp_path):
    path = tmp_path / 'jd.md'
    path.write_text('# Role\n')
    assert read_text_file(str(path), '--job-description-file') == '# Role\n'


def test_read_text_file_missing(tmp_path):
    with pytest.raises(FileInputError, match='--job-description-file'):
        read_text_file(str(tmp_path / 'x.md'), '--job-description-file')


# --- validation ----------------------------------------------------------


def test_unknown_key_is_refused():
    with pytest.raises(FileInputError, match='headlineee: unknown field'):
        validate_cv_document({**MINIMAL, 'headlineee': 'x'})


def test_wrong_type_is_refused():
    with pytest.raises(FileInputError, match='links'):
        validate_cv_document({**MINIMAL, 'links': 'not-a-list'})


def test_over_length_is_refused():
    with pytest.raises(FileInputError, match='headline'):
        validate_cv_document({**MINIMAL, 'headline': 'x' * 301})


def test_bad_month_is_refused():
    document = {
        'experience': [
            {
                'company': 'Acme',
                'role': 'Dev',
                'start': '2020-13',
            }
        ]
    }
    with pytest.raises(FileInputError, match='experience.0.start'):
        validate_cv_document(document)


def test_end_before_start_is_refused():
    document = {
        'education': [
            {
                'institution': 'MIT',
                'degree': 'BSc',
                'start': '2020-03',
                'end': '2019-01',
            }
        ]
    }
    with pytest.raises(FileInputError, match='earlier than start'):
        validate_cv_document(document)


def test_explicit_null_is_refused_except_phone():
    with pytest.raises(FileInputError, match='headline cannot be null'):
        validate_cv_document({'headline': None})
    assert validate_cv_document({'phone': None}) == {'phone': None}


def test_read_only_keys_are_dropped_so_a_response_round_trips():
    response = {
        **MINIMAL,
        'id': '900',
        'created_at': 'x',
        'updated_at': 'y',
        'application_id': '1',
        'base_cv_id': '900',
        'was_ai_generated': False,
        'adjustments': [],
        'base_snapshot': {'name': 'old'},
    }
    assert validate_cv_document(response) == MINIMAL


def test_only_the_keys_given_come_back():
    assert validate_cv_document({'headline': 'New'}) == {'headline': 'New'}


def test_item_ids_are_generated_and_preserved():
    document = validate_cv_document({
        'links': [
            {'label': 'A', 'url': 'https://a'},
            {'id': 'keep-me', 'label': 'B', 'url': 'https://b'},
        ]
    })
    generated, kept = document['links']
    assert generated['id']
    assert generated['id'] != 'keep-me'
    assert kept['id'] == 'keep-me'


def test_missing_required_item_field_is_refused():
    with pytest.raises(FileInputError, match='links.0.url'):
        validate_cv_document({'links': [{'label': 'A'}]})


# --- download naming -----------------------------------------------------


@pytest.mark.parametrize(
    ('header', 'expected'),
    [
        ('attachment; filename="backend-cv.pdf"', 'backend-cv.pdf'),
        ('attachment; filename=plain.md', 'plain.md'),
        ("attachment; filename*=UTF-8''cv%20ada.pdf", 'cv ada.pdf'),
        ('attachment', 'fallback'),
        ('', 'fallback'),
    ],
)
def test_filename_from_headers(header, expected):
    headers = {'Content-Disposition': header} if header else {}
    assert filename_from_headers(headers, 'fallback') == expected


def test_filename_lookup_is_case_insensitive():
    headers = {'content-disposition': 'attachment; filename="a.pdf"'}
    assert filename_from_headers(headers, 'fallback') == 'a.pdf'


@pytest.mark.parametrize(
    ('name', 'extension', 'expected'),
    [
        ('cv', '.pdf', 'cv.pdf'),
        ('cv.pdf', '.pdf', 'cv.pdf'),
        ('cv.PDF', '.pdf', 'cv.PDF'),
        ('cv.md', '.pdf', 'cv.md.pdf'),
    ],
)
def test_with_extension(name, extension, expected):
    assert with_extension(name, extension) == expected


def test_resolve_target_creates_the_directory(tmp_path):
    target = resolve_target(
        directory=str(tmp_path / 'deep' / 'nested'),
        filename='cv',
        server_filename='server.pdf',
        download_type=DownloadType.PDF,
        force=False,
    )
    assert target == tmp_path / 'deep' / 'nested' / 'cv.pdf'
    assert target.parent.is_dir()


def test_resolve_target_defaults_to_the_server_name(tmp_path):
    target = resolve_target(
        directory=str(tmp_path),
        filename=None,
        server_filename='server-name.md',
        download_type=DownloadType.MD,
        force=False,
    )
    assert target.name == 'server-name.md'


def test_resolve_target_refuses_an_existing_file(tmp_path):
    (tmp_path / 'cv.pdf').write_text('old')
    with pytest.raises(FileInputError, match='--force'):
        resolve_target(
            directory=str(tmp_path),
            filename='cv.pdf',
            server_filename='ignored.pdf',
            download_type=DownloadType.PDF,
            force=False,
        )


def test_resolve_target_overwrites_with_force(tmp_path):
    (tmp_path / 'cv.pdf').write_text('old')
    target = resolve_target(
        directory=str(tmp_path),
        filename='cv.pdf',
        server_filename='ignored.pdf',
        download_type=DownloadType.PDF,
        force=True,
    )
    assert target == tmp_path / 'cv.pdf'


def test_resolve_target_refuses_a_path_as_filename(tmp_path):
    with pytest.raises(FileInputError, match='not a path'):
        resolve_target(
            directory=str(tmp_path),
            filename='sub/cv.pdf',
            server_filename='ignored.pdf',
            download_type=DownloadType.PDF,
            force=False,
        )
