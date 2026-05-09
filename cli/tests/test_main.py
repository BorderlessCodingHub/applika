import json

import httpx

import applications.commands as applications_commands
import auth_commands
import main as cli_main
from session import SessionData


def _session() -> SessionData:
    return SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token='access',
        refresh_token='refresh',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )


class FakeStore:
    def __init__(self, session: SessionData | None = None):
        self.session = session
        self.saved: SessionData | None = None
        self.cleared = False

    def try_load(self) -> SessionData | None:
        return self.session

    def save(self, session: SessionData) -> None:
        self.saved = session
        self.session = session

    def clear(self) -> None:
        self.cleared = True
        self.session = None


class FakeApiClient:
    applications = []
    supports = {'platforms': []}
    company_matches = []
    created_response = {}
    updated_response = {}
    captured_post_payload = None
    captured_put_payload = None
    captured_application_params = None

    def __init__(self, session, store):
        self.session = session
        self.store = store

    def close(self) -> None:
        return None

    def get_json(self, path, *, params=None):
        if path == '/applications':
            FakeApiClient.captured_application_params = params
            return FakeApiClient.applications
        if path == '/supports':
            return FakeApiClient.supports
        if path == '/companies':
            return FakeApiClient.company_matches
        raise AssertionError(f'Unexpected GET path: {path}')

    def post_json(self, path, payload):
        assert path == '/applications'
        FakeApiClient.captured_post_payload = payload
        return FakeApiClient.created_response

    def put_json(self, path, payload):
        assert path.startswith('/applications/')
        FakeApiClient.captured_put_payload = payload
        return FakeApiClient.updated_response


def _install_fake_store(monkeypatch, store: FakeStore) -> None:
    monkeypatch.setattr(cli_main, 'SessionStore', lambda: store)


def _install_fake_api_client(monkeypatch) -> None:
    FakeApiClient.applications = []
    FakeApiClient.supports = {'platforms': []}
    FakeApiClient.company_matches = []
    FakeApiClient.created_response = {}
    FakeApiClient.updated_response = {}
    FakeApiClient.captured_post_payload = None
    FakeApiClient.captured_put_payload = None
    FakeApiClient.captured_application_params = None
    monkeypatch.setattr(applications_commands, 'ApiClient', FakeApiClient)


def _response(
    status_code: int,
    *,
    json_data=None,
    url: str,
):
    request = httpx.Request('POST', url)
    response = httpx.Response(status_code, json=json_data, request=request)
    return response


def test_applications_list_filters_and_outputs_json(
    monkeypatch,
    capsys,
):
    store = FakeStore(_session())
    _install_fake_store(monkeypatch, store)
    _install_fake_api_client(monkeypatch)

    FakeApiClient.supports = {
        'platforms': [
            {'id': 10, 'name': 'LinkedIn'},
            {'id': 11, 'name': 'Indeed'},
        ]
    }
    FakeApiClient.applications = [
        {
            'id': 1,
            'application_date': '2026-05-08',
            'company_name': 'Acme',
            'role': 'Backend Engineer',
            'mode': 'active',
            'platform_id': 10,
            'finalized': False,
        },
        {
            'id': 2,
            'application_date': '2026-05-07',
            'company_name': 'Other',
            'role': 'Designer',
            'mode': 'passive',
            'platform_id': 11,
            'finalized': True,
        },
    ]

    exit_code = cli_main.main(
        [
            '--api-base-url',
            'http://api.test/api',
            'applications',
            'list',
            '--cycle-id',
            '77',
            '--search',
            'acme',
            '--platform',
            'LinkedIn',
            '--status',
            'active',
            '--json',
        ]
    )

    assert exit_code == 0
    assert FakeApiClient.captured_application_params == {'cycle_id': '77'}
    output = json.loads(capsys.readouterr().out)
    assert output == [FakeApiClient.applications[0]]


def test_applications_new_builds_ui_matching_payload(monkeypatch, capsys):
    store = FakeStore(_session())
    _install_fake_store(monkeypatch, store)
    _install_fake_api_client(monkeypatch)

    FakeApiClient.supports = {'platforms': [{'id': 10, 'name': 'LinkedIn'}]}
    FakeApiClient.company_matches = [{'id': 55, 'name': 'Acme'}]
    FakeApiClient.created_response = {
        'id': 42,
        'company_name': 'Acme',
        'role': 'Platform Engineer',
        'application_date': '2026-05-08',
    }

    exit_code = cli_main.main(
        [
            'applications',
            'new',
            '--company',
            'Acme',
            '--role',
            'Platform Engineer',
            '--platform',
            'LinkedIn',
            '--mode',
            'active',
            '--date',
            '2026-05-08',
            '--job-url',
            'https://jobs.example/acme',
            '--country',
            'Brazil',
            '--salary-min',
            '1000',
            '--salary-max',
            '2000',
            '--currency',
            'USD',
            '--salary-period',
            'annual',
        ]
    )

    assert exit_code == 0
    assert FakeApiClient.captured_post_payload == {
        'company': '55',
        'platform_id': '10',
        'role': 'Platform Engineer',
        'mode': 'active',
        'application_date': '2026-05-08',
        'link_to_job': 'https://jobs.example/acme',
        'observation': None,
        'country': 'Brazil',
        'currency': 'USD',
        'salary_period': 'annual',
        'expected_salary': None,
        'salary_range_min': 1000.0,
        'salary_range_max': 2000.0,
        'experience_level': None,
        'work_mode': None,
    }
    assert (
        'Created application: id=42 company=Acme role=Platform Engineer' in capsys.readouterr().out
    )


def test_applications_edit_merges_existing_values_and_clear_flags(
    monkeypatch,
    capsys,
):
    store = FakeStore(_session())
    _install_fake_store(monkeypatch, store)
    _install_fake_api_client(monkeypatch)

    FakeApiClient.supports = {'platforms': [{'id': 10, 'name': 'LinkedIn'}]}
    FakeApiClient.company_matches = [{'id': 88, 'name': 'NewCo'}]
    FakeApiClient.applications = [
        {
            'id': 99,
            'company_id': None,
            'company_name': 'OldCo',
            'platform_id': 10,
            'role': 'Backend Engineer',
            'mode': 'active',
            'application_date': '2026-05-01',
            'link_to_job': 'https://jobs.example/old',
            'observation': 'note',
            'country': 'Brazil',
            'currency': 'USD',
            'salary_period': 'annual',
            'expected_salary': 1500.0,
            'salary_range_min': 1000.0,
            'salary_range_max': 2000.0,
            'experience_level': 'senior',
            'work_mode': 'remote',
            'finalized': False,
        }
    ]
    FakeApiClient.updated_response = {
        'id': 99,
        'company_name': 'NewCo',
        'role': 'Staff Engineer',
        'application_date': '2026-05-01',
    }

    exit_code = cli_main.main(
        [
            'applications',
            'edit',
            '99',
            '--company',
            'NewCo',
            '--role',
            'Staff Engineer',
            '--clear-job-url',
            '--clear-observation',
            '--clear-country',
            '--clear-salary',
        ]
    )

    assert exit_code == 0
    assert FakeApiClient.captured_put_payload == {
        'company': '88',
        'platform_id': '10',
        'role': 'Staff Engineer',
        'mode': 'active',
        'application_date': '2026-05-01',
        'link_to_job': None,
        'observation': None,
        'country': None,
        'currency': None,
        'salary_period': None,
        'expected_salary': None,
        'salary_range_min': None,
        'salary_range_max': None,
        'experience_level': 'senior',
        'work_mode': 'remote',
    }
    assert 'Updated application: id=99 company=NewCo role=Staff Engineer' in capsys.readouterr().out


def test_applications_edit_rejects_finalized(monkeypatch, capsys):
    store = FakeStore(_session())
    _install_fake_store(monkeypatch, store)
    _install_fake_api_client(monkeypatch)

    FakeApiClient.applications = [
        {
            'id': 1,
            'finalized': True,
        }
    ]

    exit_code = cli_main.main(['applications', 'edit', '1'])

    assert exit_code == 1
    assert 'Finalized applications cannot be edited' in capsys.readouterr().err


def test_login_returns_error_on_state_mismatch(monkeypatch, capsys):
    saved_sessions = []

    class FakeLoginStore(FakeStore):
        def save(self, session: SessionData) -> None:
            saved_sessions.append(session)
            super().save(session)

    store = FakeLoginStore()
    _install_fake_store(monkeypatch, store)

    class FakeServer:
        def __init__(self, expected_state: str):
            self.callback_url = 'http://127.0.0.1:43129/callback'
            self.closed = False

        def start(self) -> None:
            return None

        def wait_for_code(self, timeout_seconds: int) -> str:
            raise RuntimeError('Login state mismatch')

        def close(self) -> None:
            self.closed = True

    responses = [
        _response(
            201,
            json_data={'login_url': 'https://example.com/login'},
            url='http://127.0.0.1:8000/api/auth/cli/start',
        )
    ]

    monkeypatch.setattr(auth_commands, 'LoopbackLoginServer', FakeServer)
    monkeypatch.setattr(auth_commands.webbrowser, 'open', lambda url: True)
    monkeypatch.setattr(
        auth_commands.httpx,
        'post',
        lambda *args, **kwargs: responses.pop(0),
    )

    exit_code = cli_main.main(['login'])

    assert exit_code == 1
    assert not saved_sessions
    assert 'Login state mismatch' in capsys.readouterr().err


def test_login_returns_error_when_exchange_fails(monkeypatch, capsys):
    saved_sessions = []

    class FakeLoginStore(FakeStore):
        def save(self, session: SessionData) -> None:
            saved_sessions.append(session)
            super().save(session)

    store = FakeLoginStore()
    _install_fake_store(monkeypatch, store)

    class FakeServer:
        def __init__(self, expected_state: str):
            self.callback_url = 'http://127.0.0.1:43129/callback'

        def start(self) -> None:
            return None

        def wait_for_code(self, timeout_seconds: int) -> str:
            return 'exchange-code'

        def close(self) -> None:
            return None

    responses = [
        _response(
            201,
            json_data={'login_url': 'https://example.com/login'},
            url='http://127.0.0.1:8000/api/auth/cli/start',
        ),
        _response(
            401,
            json_data={'detail': 'Invalid or expired CLI exchange code'},
            url='http://127.0.0.1:8000/api/auth/cli/exchange',
        ),
    ]

    monkeypatch.setattr(auth_commands, 'LoopbackLoginServer', FakeServer)
    monkeypatch.setattr(auth_commands.webbrowser, 'open', lambda url: True)
    monkeypatch.setattr(
        auth_commands.httpx,
        'post',
        lambda *args, **kwargs: responses.pop(0),
    )

    exit_code = cli_main.main(['login'])

    assert exit_code == 1
    assert not saved_sessions
    assert '401' in capsys.readouterr().err
