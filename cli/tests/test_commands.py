import json

import httpx
from conftest import FakeApiClient, FakeStore, make_session, reset_fake_client

import applika.app as cli_app
import applika.commands.applications.commands as applications_commands
import applika.commands.auth as auth_commands
import applika.commands.skill as skill_module
from applika.app import app


def _setup_auth(monkeypatch, session=None):
    store = FakeStore(session or make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_client()
    monkeypatch.setattr(auth_commands, 'ApiClient', FakeApiClient)
    return store


def _response(status_code: int, *, json_data=None, url: str):
    request = httpx.Request('POST', url)
    return httpx.Response(status_code, json=json_data, request=request)


def _setup(monkeypatch, session=None):
    store = FakeStore(session or make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_client()
    monkeypatch.setattr(applications_commands, 'ApiClient', FakeApiClient)
    return store


def test_applications_list_filters_and_outputs_json(monkeypatch, runner):
    _setup(monkeypatch)
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

    result = runner.invoke(
        app,
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
            '--output-format',
            'json',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_application_params == {'cycle_id': '77'}
    output = json.loads(result.output)
    assert output == [FakeApiClient.applications[0]]


def test_applications_new_builds_matching_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = {'platforms': [{'id': 10, 'name': 'LinkedIn'}]}
    FakeApiClient.company_matches = [{'id': 55, 'name': 'Acme'}]
    FakeApiClient.created_response = {
        'id': 42,
        'company_name': 'Acme',
        'role': 'Platform Engineer',
        'application_date': '2026-05-08',
    }

    result = runner.invoke(
        app,
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
        ],
    )

    assert result.exit_code == 0
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
        'Created application: id=42 company=Acme role=Platform Engineer'
        in result.output
    )


def test_applications_new_salary_validation_fails_without_currency(
    monkeypatch, runner
):
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
            '--expected-salary',
            '5000',
        ],
    )

    assert result.exit_code == 1
    assert '--currency and --salary-period are required' in result.output


def test_applications_edit_merges_existing_and_clear_flags(monkeypatch, runner):
    _setup(monkeypatch)
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

    result = runner.invoke(
        app,
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
        ],
    )

    assert result.exit_code == 0
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
    assert (
        'Updated application: id=99 company=NewCo role=Staff Engineer'
        in result.output
    )


def test_applications_edit_rejects_finalized(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.applications = [{'id': 1, 'finalized': True}]

    result = runner.invoke(app, ['applications', 'edit', '1'])

    assert result.exit_code == 1
    assert 'Finalized applications cannot be edited' in result.output


def test_login_error_on_state_mismatch(monkeypatch, runner):
    store = FakeStore()
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)

    class FakeServer:
        def __init__(self, expected_state):
            self.callback_url = 'http://127.0.0.1:43129/callback'

        def start(self):
            return None

        def wait_for_code(self, timeout_seconds):
            raise RuntimeError('Login state mismatch')

        def close(self):
            return None

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
        auth_commands.httpx, 'post', lambda *a, **kw: responses.pop(0)
    )

    result = runner.invoke(app, ['login'])

    assert result.exit_code == 1
    assert store.saved is None
    assert 'Login state mismatch' in result.output


def test_login_error_when_exchange_fails(monkeypatch, runner):
    store = FakeStore()
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)

    class FakeServer:
        def __init__(self, expected_state):
            self.callback_url = 'http://127.0.0.1:43129/callback'

        def start(self):
            return None

        def wait_for_code(self, timeout_seconds):
            return 'exchange-code'

        def close(self):
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
        auth_commands.httpx, 'post', lambda *a, **kw: responses.pop(0)
    )

    result = runner.invoke(app, ['login'])

    assert result.exit_code == 1
    assert store.saved is None
    assert '401' in result.output


def test_whoami_prints_user_info(monkeypatch, runner):
    _setup_auth(monkeypatch)
    FakeApiClient.whoami_response = {
        'username': 'luissoares',
        'email': 'luis@example.com',
        'first_name': 'Luis',
        'last_name': 'Soares',
    }

    result = runner.invoke(app, ['whoami'])

    assert result.exit_code == 0
    assert 'username=luissoares' in result.output
    assert 'name=Luis Soares' in result.output
    assert 'email=luis@example.com' in result.output


def test_whoami_works_without_name(monkeypatch, runner):
    _setup_auth(monkeypatch)
    FakeApiClient.whoami_response = {
        'username': 'ghost',
        'email': 'ghost@example.com',
    }

    result = runner.invoke(app, ['whoami'])

    assert result.exit_code == 0
    assert 'username=ghost' in result.output
    assert '  name=' not in result.output


def test_skill_dry_run(monkeypatch, runner, tmp_path):
    tools = [('Claude', tmp_path / 'skills')]
    monkeypatch.setattr(skill_module, '_TOOLS', tools)

    result = runner.invoke(
        app, ['skill', '--dir', str(tmp_path / 'custom'), '--dry-run']
    )

    assert result.exit_code == 0
    assert '[dry-run]' in result.output
    assert not (tmp_path / 'custom').exists()


def test_skill_dir_copies(monkeypatch, runner, tmp_path):
    result = runner.invoke(app, ['skill', '--dir', str(tmp_path / 'skills')])

    assert result.exit_code == 0
    dest = tmp_path / 'skills' / 'applika-cli'
    assert dest.is_dir()
    assert (dest / 'SKILL.md').exists()


def test_skill_local_copies_to_cwd(monkeypatch, runner, tmp_path):
    monkeypatch.chdir(tmp_path)

    result = runner.invoke(app, ['skill', '--local'])

    assert result.exit_code == 0
    dest = tmp_path / '.claude' / 'skills' / 'applika-cli'
    assert dest.is_dir()
    assert (dest / 'SKILL.md').exists()


def test_skill_interactive_single_tool(monkeypatch, runner, tmp_path):
    tools = [('Claude', tmp_path / 'claude-skills')]
    monkeypatch.setattr(skill_module, '_TOOLS', tools)

    result = runner.invoke(app, ['skill'], input='1\n')

    assert result.exit_code == 0
    dest = tmp_path / 'claude-skills' / 'applika-cli'
    assert dest.is_dir() or dest.is_symlink()


def test_skill_interactive_all_tools(monkeypatch, runner, tmp_path):
    tools = [
        ('Claude', tmp_path / 'claude'),
        ('Gemini', tmp_path / 'gemini'),
    ]
    monkeypatch.setattr(skill_module, '_TOOLS', tools)

    result = runner.invoke(app, ['skill'], input='3\n')  # "All" = len(tools)+1

    assert result.exit_code == 0
    assert (tmp_path / 'claude' / 'applika-cli').exists()
    assert (tmp_path / 'gemini' / 'applika-cli').exists()


def test_skill_skips_if_already_installed(monkeypatch, runner, tmp_path):
    dest = tmp_path / 'skills' / 'applika-cli'
    dest.mkdir(parents=True)

    result = runner.invoke(app, ['skill', '--dir', str(tmp_path / 'skills')])

    assert result.exit_code == 0
    assert 'Skipped' in result.output


def test_skill_force_overwrites(monkeypatch, runner, tmp_path):
    dest = tmp_path / 'skills' / 'applika-cli'
    dest.mkdir(parents=True)

    result = runner.invoke(
        app, ['skill', '--dir', str(tmp_path / 'skills'), '--force']
    )

    assert result.exit_code == 0
    assert (dest / 'SKILL.md').exists()
