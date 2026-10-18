import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from conftest import FakeApiClient, FakeStore, make_session, reset_fake_client

import applika.app as cli_app
import applika.commands.applications.commands as applications_commands
import applika.commands.auth as auth_commands
import applika.commands.skill as skill_module
import applika.commands.version as version_module
from applika.app import app
from applika.lib import device_flow, pkce
from applika.lib.session import SessionData, SessionStore


def _setup_auth(monkeypatch, session=None):
    store = FakeStore(session or make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_client()
    monkeypatch.setattr(auth_commands, 'ApiClient', FakeApiClient)
    return store


def _setup(monkeypatch, session=None):
    store = FakeStore(session or make_session())
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    reset_fake_client()
    monkeypatch.setattr(applications_commands, 'ApiClient', FakeApiClient)
    return store


def _supports():
    return {
        'platforms': [{'id': '10', 'name': 'LinkedIn'}],
        'steps': [
            {
                'id': '1',
                'name': 'Initial Screen',
                'color': '#aaa',
                'strict': False,
            },
            {
                'id': '2',
                'name': 'Manager Interview',
                'color': '#bbb',
                'strict': False,
            },
            {'id': '9', 'name': 'Offer', 'color': '#0f0', 'strict': True},
        ],
        'feedbacks': [
            {'id': '7', 'name': 'Not good enough', 'color': '#f00'},
            {'id': '8', 'name': 'Accepted', 'color': '#0f0'},
        ],
    }


def test_applications_list_filters_and_outputs_json(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = {
        'platforms': [
            {'id': '10', 'name': 'LinkedIn'},
            {'id': '11', 'name': 'Indeed'},
        ]
    }
    FakeApiClient.applications = [
        {
            'id': '1',
            'application_date': '2026-05-08',
            'company_name': 'Acme',
            'role': 'Backend Engineer',
            'mode': 'active',
            'platform_id': '10',
            'finalized': False,
        },
        {
            'id': '2',
            'application_date': '2026-05-07',
            'company_name': 'Other',
            'role': 'Designer',
            'mode': 'passive',
            'platform_id': '11',
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
    FakeApiClient.supports = {'platforms': [{'id': '10', 'name': 'LinkedIn'}]}
    FakeApiClient.company_matches = [{'id': '55', 'name': 'Acme'}]
    FakeApiClient.created_response = {
        'id': '42',
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
    FakeApiClient.supports = {'platforms': [{'id': '10', 'name': 'LinkedIn'}]}

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
    assert 'currency and salary-period are required' in result.output


def test_applications_edit_merges_existing_and_clear_flags(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = {'platforms': [{'id': '10', 'name': 'LinkedIn'}]}
    FakeApiClient.company_matches = [{'id': '88', 'name': 'NewCo'}]
    FakeApiClient.applications = [
        {
            'id': '99',
            'company_id': None,
            'company_name': 'OldCo',
            'platform_id': '10',
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
        'id': '99',
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
            '--clear',
            'job_url',
            '--clear',
            'observation',
            '--clear',
            'country',
            '--clear',
            'salary',
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
    FakeApiClient.applications = [{'id': '1', 'finalized': True}]

    result = runner.invoke(app, ['applications', 'edit', '1'])

    assert result.exit_code == 1
    assert 'Finalized applications cannot be edited' in result.output


def test_applications_commands_include_steps_and_finalize(runner):
    result = runner.invoke(app, ['applications', '--help'])

    assert result.exit_code == 0
    assert 'steps' in result.output
    assert 'finalize' in result.output


def test_application_steps_help_lists_subcommands(runner):
    result = runner.invoke(app, ['applications', 'steps', '--help'])

    assert result.exit_code == 0
    assert 'list' in result.output
    assert 'add' in result.output
    assert 'edit' in result.output
    assert 'delete' in result.output


def test_application_steps_list_outputs_table(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
            }
        ]
    }

    result = runner.invoke(app, ['applications', 'steps', 'list', '99'])

    assert result.exit_code == 0
    assert 'Initial Screen' in result.output
    assert '2026-05-11' in result.output


def test_application_steps_list_outputs_json(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
            }
        ]
    }

    result = runner.invoke(
        app,
        ['applications', 'steps', 'list', '99', '--output-format', 'json'],
    )

    assert result.exit_code == 0
    assert json.loads(result.output)[0]['id'] == '500'


def test_application_steps_add_builds_matching_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]
    FakeApiClient.step_created_response = {
        'id': '500',
        'step_id': '1',
        'step_name': 'Initial Screen',
        'step_date': '2026-05-11',
        'start_time': '09:00',
        'end_time': '10:00',
        'timezone': 'America/Sao_Paulo',
        'observation': 'Met recruiter',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'add',
            '99',
            '--step',
            'Initial Screen',
            '--date',
            '2026-05-11',
            '--start-time',
            '09:00',
            '--end-time',
            '10:00',
            '--timezone',
            'America/Sao_Paulo',
            '--observation',
            'Met recruiter',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/steps'
    assert FakeApiClient.captured_post_payload == {
        'step_id': '1',
        'step_date': '2026-05-11',
        'start_time': '09:00',
        'end_time': '10:00',
        'timezone': 'America/Sao_Paulo',
        'observation': 'Met recruiter',
    }
    assert (
        'Added step: id=500 step=Initial Screen date=2026-05-11'
        in result.output
    )


def test_application_steps_add_rejects_strict_step(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'add',
            '99',
            '--step',
            'Offer',
            '--date',
            '2026-05-11',
        ],
    )

    assert result.exit_code == 1
    assert 'Unknown step.' in result.output


def test_application_steps_add_rejects_invalid_time_pairs(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'add',
            '99',
            '--step',
            'Initial Screen',
            '--date',
            '2026-05-11',
            '--start-time',
            '09:00',
        ],
    )

    assert result.exit_code == 1
    assert 'start-time and end-time must be provided together' in result.output


def test_application_steps_edit_merges_existing_and_clear_flags(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': '09:00',
                'end_time': '10:00',
                'timezone': 'America/Sao_Paulo',
                'observation': 'Old note',
            }
        ]
    }
    FakeApiClient.step_updated_response = {
        'id': '500',
        'step_id': '2',
        'step_name': 'Manager Interview',
        'step_date': '2026-05-11',
        'start_time': None,
        'end_time': None,
        'timezone': 'America/Sao_Paulo',
        'observation': None,
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'edit',
            '99',
            '500',
            '--step',
            'Manager Interview',
            '--clear',
            'observation',
            '--clear',
            'time',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_path == '/applications/99/steps/500'
    assert FakeApiClient.captured_put_payload == {
        'step_id': '2',
        'step_date': '2026-05-11',
        'start_time': None,
        'end_time': None,
        'timezone': 'America/Sao_Paulo',
        'observation': None,
    }
    assert (
        'Updated step: id=500 step=Manager Interview date=2026-05-11'
        in result.output
    )


def test_application_steps_delete_calls_correct_endpoint(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
            }
        ]
    }

    result = runner.invoke(
        app,
        ['applications', 'steps', 'delete', '99', '500'],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_delete_path == '/applications/99/steps/500'
    assert 'Deleted step: id=500' in result.output


def test_application_steps_edit_accepts_explicit_id_flags(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': '09:00',
                'end_time': '10:00',
                'timezone': 'America/Sao_Paulo',
                'observation': 'Old note',
            }
        ]
    }
    FakeApiClient.step_updated_response = {
        'id': '500',
        'step_id': '2',
        'step_name': 'Manager Interview',
        'step_date': '2026-05-11',
        'start_time': '15:00',
        'end_time': '16:00',
        'timezone': 'America/Sao_Paulo',
        'observation': 'Old note',
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'edit',
            '--application-id',
            '99',
            '--step-record-id',
            '500',
            '--step',
            'Manager Interview',
            '--start-time',
            '15:00',
            '--end-time',
            '16:00',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_put_path == '/applications/99/steps/500'
    assert FakeApiClient.captured_put_payload == {
        'step_id': '2',
        'step_date': '2026-05-11',
        'start_time': '15:00',
        'end_time': '16:00',
        'timezone': 'America/Sao_Paulo',
        'observation': 'Old note',
    }


def test_application_steps_edit_rejects_conflicting_ids(monkeypatch, runner):
    _setup(monkeypatch)

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'edit',
            '99',
            '500',
            '--application-id',
            '100',
            '--step-record-id',
            '500',
        ],
    )

    assert result.exit_code == 1
    assert 'Conflicting application id' in result.output


def test_application_steps_delete_accepts_explicit_id_flags(
    monkeypatch, runner
):
    _setup(monkeypatch)
    FakeApiClient.applications = [{'id': '99', 'finalized': False}]
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
            }
        ]
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'steps',
            'delete',
            '--application-id',
            '99',
            '--step-record-id',
            '500',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_delete_path == '/applications/99/steps/500'


@pytest.mark.parametrize(
    'command', [['add'], ['edit', '500'], ['delete', '500']]
)
def test_application_step_mutations_reject_finalized_applications(
    monkeypatch, runner, command
):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.applications = [{'id': '99', 'finalized': True}]
    FakeApiClient.application_steps = {
        '99': [
            {
                'id': '500',
                'step_id': '1',
                'step_name': 'Initial Screen',
                'step_date': '2026-05-11',
                'start_time': None,
                'end_time': None,
                'timezone': None,
                'observation': None,
            }
        ]
    }

    args = ['applications', 'steps', *command, '99']
    if command == ['add']:
        args.extend(['--step', 'Initial Screen', '--date', '2026-05-11'])
    else:
        args = ['applications', 'steps', command[0], '99', command[1]]

    result = runner.invoke(app, args)

    assert result.exit_code == 1
    assert 'already been finalized' in result.output


def test_applications_finalize_posts_matching_payload(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': 180000.0,
        'last_step': {'name': 'Offer', 'date': '2026-05-18'},
        'feedback': {'name': 'Accepted', 'date': '2026-05-18'},
    }

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
            '2026-05-18',
            '--salary-offer',
            '180000',
            '--observation',
            'Signed',
        ],
    )

    assert result.exit_code == 0
    assert FakeApiClient.captured_post_path == '/applications/99/finalize'
    assert FakeApiClient.captured_post_payload == {
        'step_id': '9',
        'feedback_id': '8',
        'finalize_date': '2026-05-18',
        'salary_offer': 180000.0,
        'observation': 'Signed',
    }
    assert (
        'Finalized application: id=99 company=Acme role=Backend Engineer'
        in result.output
    )
    assert 'final_step=Offer' in result.output
    assert 'feedback=Accepted' in result.output


def test_applications_finalize_outputs_json(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()
    FakeApiClient.finalized_response = {
        'id': '99',
        'company_name': 'Acme',
        'role': 'Backend Engineer',
        'salary_offer': None,
        'last_step': {'name': 'Denied', 'date': '2026-05-18'},
        'feedback': {'name': 'Not good enough', 'date': '2026-05-18'},
    }

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--step',
            'Offer',
            '--feedback',
            'Not good enough',
            '--date',
            '2026-05-18',
            '--output-format',
            'json',
        ],
    )

    assert result.exit_code == 0
    assert json.loads(result.output)['id'] == '99'


def test_applications_finalize_rejects_non_strict_steps(monkeypatch, runner):
    _setup(monkeypatch)
    FakeApiClient.supports = _supports()

    result = runner.invoke(
        app,
        [
            'applications',
            'finalize',
            '99',
            '--step',
            'Initial Screen',
            '--feedback',
            'Not good enough',
            '--date',
            '2026-05-18',
        ],
    )

    assert result.exit_code == 1
    assert 'Unknown step.' in result.output


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


def test_root_version_flag_prints_installed_version(monkeypatch, runner):
    monkeypatch.setattr(cli_app, 'installed_version', lambda: '0.1.2')

    result = runner.invoke(app, ['--version'])

    assert result.exit_code == 0
    assert result.output.strip() == '0.1.2'


def test_version_command_prints_installed_and_published(monkeypatch, runner):
    monkeypatch.setattr(version_module, 'installed_version', lambda: '0.1.2')

    def fake_get(url, timeout):
        assert url == 'https://pypi.org/pypi/applika-cli/json'
        assert timeout == 10
        request = httpx.Request('GET', url)
        return httpx.Response(
            200,
            json={'info': {'version': '0.1.3'}},
            request=request,
        )

    monkeypatch.setattr(version_module.httpx, 'get', fake_get)

    result = runner.invoke(app, ['version'])

    assert result.exit_code == 0
    assert 'installed: 0.1.2' in result.output
    assert 'published: 0.1.3' in result.output


def test_version_command_handles_unavailable_pypi(monkeypatch, runner):
    monkeypatch.setattr(version_module, 'installed_version', lambda: '0.1.2')

    def fake_get(url, timeout):
        request = httpx.Request('GET', url)
        raise httpx.ConnectError('network down', request=request)

    monkeypatch.setattr(version_module.httpx, 'get', fake_get)

    result = runner.invoke(app, ['version'])

    assert result.exit_code == 0
    assert 'installed: 0.1.2' in result.output
    assert 'published: unavailable' in result.output


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


# --- KODI-060: login (browser PKCE, --manual, --device), logout ---------

API = 'http://127.0.0.1:8000/api'
TOKEN_ANSWER = {
    'access_token': 'new-access',
    'token_type': 'Bearer',
    'expires_in': 900,
    'refresh_token': 'new-refresh',
    'refresh_expires_in': 604800,
}
DEVICE_ANSWER = {
    'device_code': 'dev-code',
    'user_code': 'ABCD-EFGH',
    'verification_uri': 'http://127.0.0.1:3000/devices/approve',
    'verification_uri_complete': (
        'http://127.0.0.1:3000/devices/approve?user_code=ABCD-EFGH'
    ),
    'expires_in': 600,
    'interval': 10,
}


class FakeApi:
    """A MockTransport router: records every request, answers by path."""

    def __init__(self, answers=None):
        self.requests: list[httpx.Request] = []
        self.answers = {
            '/api/auth/revoke': [httpx.Response(204)],
            '/api/auth/token': [httpx.Response(200, json=TOKEN_ANSWER)],
            '/api/auth/device/code': [httpx.Response(200, json=DEVICE_ANSWER)],
            '/api/users/me': [httpx.Response(200, json={'username': 'luis'})],
        }
        self.answers.update(answers or {})

    def __call__(self, request: httpx.Request) -> httpx.Response:
        request.read()
        self.requests.append(request)
        queue = self.answers.get(request.url.path)
        if not queue:
            raise AssertionError(f'Unexpected request: {request.url}')
        answer = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(answer, Exception):
            raise answer
        return answer

    def paths(self) -> list[str]:
        return [r.url.path for r in self.requests]

    def bodies(self, path: str) -> list[dict]:
        return [
            json.loads(r.content) for r in self.requests if r.url.path == path
        ]


class FakeLoopback:
    instances: list['FakeLoopback'] = []
    code: str | None = 'the-code'
    error: str | None = None

    def __init__(self, expected_state):
        self.expected_state = expected_state
        self.callback_url = 'http://127.0.0.1:43129/callback'
        self.closed = False
        FakeLoopback.instances.append(self)

    def start(self):
        return None

    def wait_for_code(self, timeout_seconds):
        if FakeLoopback.error:
            raise RuntimeError(FakeLoopback.error)
        return FakeLoopback.code

    def close(self):
        self.closed = True


@pytest.fixture
def login_env(monkeypatch, tmp_path):
    """Real SessionStore under tmp_path, a FakeApi transport, a fake
    loopback server, a recorded webbrowser.open, host name 'dev-box', and
    no real sleeping in the device flow."""
    store = SessionStore(tmp_path / 'session.json')
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    api = FakeApi()
    monkeypatch.setattr(auth_commands, '_transport', httpx.MockTransport(api))
    FakeLoopback.instances = []
    FakeLoopback.code = 'the-code'
    FakeLoopback.error = None
    monkeypatch.setattr(auth_commands, 'LoopbackLoginServer', FakeLoopback)
    opened: list[str] = []
    monkeypatch.setattr(
        auth_commands.webbrowser, 'open', lambda url: opened.append(url)
    )
    monkeypatch.setattr(auth_commands.socket, 'gethostname', lambda: 'dev-box')
    monkeypatch.setattr(device_flow.time, 'sleep', lambda seconds: None)

    class Env:
        pass

    env = Env()
    env.store = store
    env.api = api
    env.opened = opened
    return env


def _saved_session(store) -> SessionData:
    session = SessionData(
        api_base_url=API,
        access_token='old-access',
        refresh_token='old-refresh',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )
    store.save(session)
    return session


def _query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


def test_login_default_is_pkce_through_the_loopback(login_env, runner):
    """AC1: browser authorization with an S256 challenge, back on the
    local callback; the code + verifier buy a session of the CLI's own."""
    result = runner.invoke(app, ['--api-base-url', API, 'login'])

    assert result.exit_code == 0, result.output
    [url] = login_env.opened
    assert url.startswith(f'{API}/auth/cli/authorize?')
    query = _query(url)
    server = FakeLoopback.instances[0]
    assert query['redirect_uri'] == server.callback_url
    assert query['code_challenge_method'] == 'S256'
    assert query['state'] == server.expected_state
    assert server.closed
    [body] = login_env.api.bodies('/api/auth/token')
    assert body['grant_type'] == 'authorization_code'
    assert body['code'] == 'the-code'
    assert body['redirect_uri'] == server.callback_url
    assert body['device_name'] == 'dev-box'
    assert pkce.s256_challenge(body['code_verifier']) == query['code_challenge']
    assert url in result.output
    saved = login_env.store.load()
    assert saved.access_token == 'new-access'
    assert saved.refresh_token == 'new-refresh'
    assert saved.api_base_url == API
    me = [r for r in login_env.api.requests if r.url.path == '/api/users/me']
    assert me[0].headers['authorization'] == 'Bearer new-access'
    assert 'cookie' not in me[0].headers
    assert 'Logged in as luis on dev-box' in result.stdout
    assert not any(
        p.startswith('/api/auth/cli/start') or p.endswith('/exchange')
        for p in login_env.api.paths()
    )


def test_login_sends_the_cli_user_agent(login_env, runner):
    result = runner.invoke(app, ['--api-base-url', API, 'login'])

    assert result.exit_code == 0, result.output
    for request in login_env.api.requests:
        assert request.headers['user-agent'].startswith('applika-cli/')


def test_login_error_on_state_mismatch(login_env, runner):
    FakeLoopback.error = 'Login state mismatch'

    result = runner.invoke(app, ['--api-base-url', API, 'login'])

    assert result.exit_code == 1
    assert 'Login state mismatch' in result.stderr
    assert login_env.store.try_load() is None
    assert login_env.api.paths() == []


def test_login_error_when_token_exchange_fails(login_env, runner):
    login_env.api.answers['/api/auth/token'] = [
        httpx.Response(
            400,
            json={
                'error': 'invalid_grant',
                'detail': 'Invalid or expired code',
            },
        )
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login'])

    assert result.exit_code == 1
    assert 'Invalid or expired code' in result.stderr
    assert login_env.store.try_load() is None


def test_login_manual_pastes_code_and_checks_state(
    login_env, runner, monkeypatch
):
    """AC3: ``--manual`` uses redirect_uri=oob, prompts for the
    ``code#state`` the browser shows, checks the state, then exchanges."""
    monkeypatch.setattr(auth_commands.pkce, 'generate_state', lambda: 'st8')

    result = runner.invoke(
        app,
        ['--api-base-url', API, 'login', '--manual'],
        input='pasted-code#st8\n',
    )

    assert result.exit_code == 0, result.output
    assert login_env.opened == []
    assert 'Paste the code shown in the browser:' in result.output
    printed = next(
        line for line in result.output.splitlines() if 'authorize?' in line
    )
    query = _query(printed)
    assert query['redirect_uri'] == 'oob'
    assert query['state'] == 'st8'
    assert query['code_challenge_method'] == 'S256'
    [body] = login_env.api.bodies('/api/auth/token')
    assert body['code'] == 'pasted-code'
    assert body['redirect_uri'] == 'oob'
    assert body['device_name'] == 'dev-box'
    assert pkce.s256_challenge(body['code_verifier']) == query['code_challenge']
    assert FakeLoopback.instances == []
    assert 'Logged in as luis on dev-box' in result.stdout


@pytest.mark.parametrize(
    ('pasted', 'message'),
    [
        ('pasted-code#other-state', 'Login state mismatch'),
        ('pasted-code', 'code#state'),
        ('#st8', 'code#state'),
    ],
)
def test_login_manual_rejects_a_bad_paste(
    login_env, runner, monkeypatch, pasted, message
):
    monkeypatch.setattr(auth_commands.pkce, 'generate_state', lambda: 'st8')

    result = runner.invoke(
        app,
        ['--api-base-url', API, 'login', '--manual'],
        input=f'{pasted}\n',
    )

    assert result.exit_code == 1
    assert message in result.stderr
    assert '/api/auth/token' not in login_env.api.paths()
    assert login_env.store.try_load() is None


def test_login_device_shows_code_and_polls_until_approved(login_env, runner):
    """AC2: ``--device`` prints the short code and the web address, polls
    POST /auth/token and gets a session of its own."""
    login_env.api.answers['/api/auth/token'] = [
        httpx.Response(
            400, json={'error': 'authorization_pending', 'detail': 'pending'}
        ),
        httpx.Response(200, json=TOKEN_ANSWER),
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 0, result.output
    assert 'ABCD-EFGH' in result.stdout
    assert DEVICE_ANSWER['verification_uri'] in result.stdout
    assert DEVICE_ANSWER['verification_uri_complete'] in result.stdout
    assert login_env.api.bodies('/api/auth/device/code') == [
        {'device_name': 'dev-box'}
    ]
    bodies = login_env.api.bodies('/api/auth/token')
    assert len(bodies) == 2
    assert bodies[0] == {
        'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
        'device_code': 'dev-code',
    }
    assert login_env.opened == []
    assert login_env.store.load().access_token == 'new-access'
    assert 'Logged in as luis on dev-box' in result.stdout


def test_login_device_denied_exits_1(login_env, runner):
    login_env.api.answers['/api/auth/token'] = [
        httpx.Response(400, json={'error': 'access_denied', 'detail': 'no'})
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 1
    assert 'denied' in result.stderr
    assert login_env.store.try_load() is None


def test_login_device_expired_exits_1(login_env, runner):
    login_env.api.answers['/api/auth/token'] = [
        httpx.Response(400, json={'error': 'expired_token', 'detail': 'gone'})
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 1
    assert 'applika login --device' in result.stderr


@pytest.mark.parametrize('flags', [[], ['--manual'], ['--device']])
def test_login_device_name_is_sent(login_env, runner, monkeypatch, flags):
    """AC5: a given ``--device-name`` replaces the host name, on every
    flow."""
    monkeypatch.setattr(auth_commands.pkce, 'generate_state', lambda: 'st8')

    result = runner.invoke(
        app,
        ['--api-base-url', API, 'login', *flags, '--device-name', ' Work PC '],
        input='c#st8\n',
    )

    assert result.exit_code == 0, result.output
    path = (
        '/api/auth/device/code' if flags == ['--device'] else '/api/auth/token'
    )
    assert login_env.api.bodies(path)[0]['device_name'] == 'Work PC'
    assert 'Logged in as luis on Work PC' in result.stdout


@pytest.mark.parametrize(
    ('host', 'expected'),
    [
        ('dev-box', 'dev-box'),
        ('h' * 150, 'h' * 100),
        ('', 'applika-cli'),
        ('   ', 'applika-cli'),
    ],
)
def test_login_device_name_defaults_to_the_host_name(
    login_env, runner, monkeypatch, host, expected
):
    monkeypatch.setattr(auth_commands.socket, 'gethostname', lambda: host)

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 0, result.output
    assert login_env.api.bodies('/api/auth/device/code') == [
        {'device_name': expected}
    ]


@pytest.mark.parametrize('name', ['x' * 101, '', '   '])
def test_login_rejects_a_bad_device_name_before_any_request(
    login_env, runner, name
):
    _saved_session(login_env.store)

    result = runner.invoke(
        app, ['--api-base-url', API, 'login', '--device-name', name]
    )

    assert result.exit_code == 2
    assert '--device-name' in result.output
    assert login_env.api.paths() == []
    assert login_env.store.load().access_token == 'old-access'


def test_login_accepts_a_100_character_device_name(login_env, runner):
    result = runner.invoke(
        app,
        [
            '--api-base-url',
            API,
            'login',
            '--device',
            '--device-name',
            'n' * 100,
        ],
    )

    assert result.exit_code == 0, result.output
    assert login_env.api.bodies('/api/auth/device/code') == [
        {'device_name': 'n' * 100}
    ]


def test_login_device_and_manual_together_is_a_usage_error(login_env, runner):
    result = runner.invoke(
        app, ['--api-base-url', API, 'login', '--device', '--manual']
    )

    assert result.exit_code == 2
    assert login_env.api.paths() == []


def test_relogin_revokes_the_old_session_first(login_env, runner):
    _saved_session(login_env.store)

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 0, result.output
    paths = login_env.api.paths()
    assert paths[0] == '/api/auth/revoke'
    assert paths.index('/api/auth/revoke') < paths.index(
        '/api/auth/device/code'
    )
    assert login_env.api.bodies('/api/auth/revoke') == [
        {'refresh_token': 'old-refresh'}
    ]
    assert login_env.store.load().refresh_token == 'new-refresh'


@pytest.mark.parametrize(
    'answer',
    [
        httpx.Response(503, json={'detail': 'Session service unavailable'}),
        httpx.Response(429, json={'detail': 'Too many requests'}),
        httpx.ConnectError('down'),
    ],
)
def test_relogin_goes_on_when_the_revoke_is_transient(
    login_env, runner, answer
):
    _saved_session(login_env.store)
    login_env.api.answers['/api/auth/revoke'] = [answer]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 0, result.output
    assert 'previous session could not be ended' in result.stderr
    assert 'Devices tab' in result.stderr
    assert login_env.store.load().refresh_token == 'new-refresh'


def test_relogin_whose_new_sign_in_fails_drops_the_revoked_session(
    login_env, runner
):
    _saved_session(login_env.store)
    login_env.api.answers['/api/auth/token'] = [
        httpx.Response(400, json={'error': 'access_denied', 'detail': 'no'})
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 1
    assert login_env.store.try_load() is None


def test_logout_revokes_on_the_server_then_clears(login_env, runner):
    """AC6: ``applika logout`` ends the CLI's own session on the server."""
    _saved_session(login_env.store)

    result = runner.invoke(app, ['logout'])

    assert result.exit_code == 0, result.output
    assert login_env.api.paths() == ['/api/auth/revoke']
    assert login_env.api.bodies('/api/auth/revoke') == [
        {'refresh_token': 'old-refresh'}
    ]
    assert login_env.api.requests[0].headers['authorization'] == (
        'Bearer old-access'
    )
    assert result.stdout.strip() == 'Logged out.'
    assert login_env.store.try_load() is None


@pytest.mark.parametrize(
    'answer',
    [
        httpx.Response(
            503,
            json={'detail': 'Session service unavailable'},
            headers={'retry-after': '5'},
        ),
        httpx.Response(429, json={'detail': 'Too many requests'}),
        httpx.ConnectError('connection refused'),
    ],
)
def test_logout_keeps_the_session_when_the_server_cannot_end_it(
    login_env, runner, answer
):
    """D1 fail closed: a 503, a 429 or no answer keeps session.json and
    exits 1, so logout never claims an end the server did not make."""
    _saved_session(login_env.store)
    before = login_env.store.path.read_bytes()
    login_env.api.answers['/api/auth/revoke'] = [answer]

    result = runner.invoke(app, ['logout'])

    assert result.exit_code == 1
    assert 'could not end the session' in result.stderr
    assert 'applika logout' in result.stderr
    assert 'Devices tab' in result.stderr
    assert 'Logged out.' not in result.output
    assert login_env.store.path.read_bytes() == before


@pytest.mark.parametrize('status', [400, 401, 422, 500])
def test_logout_other_answer_clears_with_a_note(login_env, runner, status):
    _saved_session(login_env.store)
    login_env.api.answers['/api/auth/revoke'] = [
        httpx.Response(status, json={'detail': 'x'})
    ]

    result = runner.invoke(app, ['logout'])

    assert result.exit_code == 0, result.output
    assert result.stdout.strip() == 'Logged out.'
    assert f'answered {status}' in result.stderr
    assert login_env.store.try_load() is None


def test_login_profile_failure_still_keeps_the_new_session(login_env, runner):
    login_env.api.answers['/api/users/me'] = [
        httpx.Response(500, json={'detail': 'boom'})
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 0, result.output
    assert 'Logged in on dev-box.' in result.stdout
    assert 'boom' in result.stderr
    assert login_env.store.load().access_token == 'new-access'


def test_login_whose_new_session_is_refused_at_once_exits_1(login_env, runner):
    """/users/me 401 and a refused refresh: the session is gone, so the
    login must not claim success."""
    login_env.api.answers['/api/users/me'] = [
        httpx.Response(401, json={'detail': 'Session expired'})
    ]
    login_env.api.answers['/api/auth/token'] = [
        httpx.Response(200, json=TOKEN_ANSWER),
        httpx.Response(400, json={'error': 'invalid_grant', 'detail': 'x'}),
    ]

    result = runner.invoke(app, ['--api-base-url', API, 'login', '--device'])

    assert result.exit_code == 1
    assert 'Logged in' not in result.stdout
    assert 'applika login' in result.stderr
    assert login_env.store.try_load() is None


def test_login_manual_aborted_at_the_prompt_says_aborted(login_env, runner):
    result = runner.invoke(
        app, ['--api-base-url', API, 'login', '--manual'], input=''
    )

    assert result.exit_code == 1
    assert 'Aborted' in result.output
    assert '/api/auth/token' not in login_env.api.paths()


def test_login_default_mentions_the_fallbacks(login_env, runner):
    result = runner.invoke(app, ['--api-base-url', API, 'login'])

    assert result.exit_code == 0, result.output
    assert 'applika login --manual' in result.stdout
    assert 'applika login --device' in result.stdout


def test_root_help_still_lists_every_1_0_1_command_and_flag(runner):
    """AC7: 1.1.0 only adds; every 1.0.1 command and root flag is there."""
    result = runner.invoke(app, ['--help'])

    assert result.exit_code == 0
    for word in (
        'login',
        'logout',
        'whoami',
        'version',
        'applications',
        'cvs',
        'skill',
        '--api-base-url',
        '--version',
    ):
        assert word in result.output


def test_login_help_lists_the_new_flags(runner):
    result = runner.invoke(app, ['login', '--help'])

    assert result.exit_code == 0
    for flag in ('--device', '--manual', '--device-name'):
        assert flag in result.output


@pytest.mark.parametrize(
    ('args', 'exit_code'),
    [(['login', '--help'], 0), (['login', '--device-name', ''], 2)],
)
def test_rich_output_stays_plain_and_wide_under_forced_colour(
    runner, args, exit_code
):
    """Guard for the conftest fixture: FORCE_COLOR and a narrow COLUMNS
    would make Rich paint and wrap help and usage errors, splitting
    ``--device-name``; the asserts above read plain text in any CI."""
    result = runner.invoke(app, args, env={'FORCE_COLOR': '1', 'COLUMNS': '40'})

    assert result.exit_code == exit_code
    assert '\x1b[' not in result.output
    assert '--device-name' in result.output
