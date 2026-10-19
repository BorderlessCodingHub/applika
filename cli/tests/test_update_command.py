import inspect
import io
import json
import subprocess
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from conftest import FakeStore, make_session
from typer.testing import CliRunner

import applika.app as cli_app
import applika.commands.update as update_module
import applika.lib.api as api_module
from applika.config import (
    ApiBaseUrlSource,
    AppConfig,
    resolve_api_base_url,
    resolve_api_base_url_with_source,
)
from applika.lib import updater
from applika.lib.updater import Blocker, BlockerKind, Install, UpdateState

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)
DEFAULT_URL = 'https://applika.dev/api'
OTHER_URL = 'http://127.0.0.1:8000/api'

UV_ARGV = ('uv', 'tool', 'upgrade', 'applika-cli')
PIPX_ARGV = ('pipx', 'upgrade', 'applika-cli')
PIP_ARGV = ('/usr/bin/python3', '-m', 'pip', 'install', '--upgrade')
PIP_ARGV += ('applika-cli',)
UV_INSTALL = Install('uv_tool', UV_ARGV, '/prefix/uv-receipt.toml')
PIPX_INSTALL = Install('pipx', PIPX_ARGV, '/prefix/pipx_metadata.json')
PIP_INSTALL = Install('pip', PIP_ARGV, '/site-packages')
EDITABLE = Install('editable', (), '/home/me/applika/cli')
UNKNOWN = Install('unknown', (), 'installer conda is not supported')

UV_LINE = 'uv tool upgrade applika-cli'

URL_FLAG_LINE = (
    'Cannot update: the API base URL is http://127.0.0.1:8000/api (from '
    '--api-base-url), not https://applika.dev/api. --force does not change '
    'this. Run without --api-base-url.'
)
URL_ENV_LINE = (
    'Cannot update: the API base URL is http://127.0.0.1:8000/api (from '
    'APPLIKA_API_BASE_URL), not https://applika.dev/api. --force does not '
    'change this. Unset APPLIKA_API_BASE_URL.'
)
URL_SESSION_LINE = (
    'Cannot update: the API base URL is http://127.0.0.1:8000/api (from '
    'your saved session), not https://applika.dev/api. --force does not '
    'change this. Run applika logout, then applika login without '
    '--api-base-url.'
)
CHECKOUT_LINE = (
    'Cannot update: applika-cli runs from a source checkout '
    '(/home/me/applika/cli). Update it with git.'
)
UNKNOWN_LINE = (
    "Cannot update: can't tell how applika-cli was installed. Upgrade with "
    'the tool you used: uv tool upgrade applika-cli, pipx upgrade '
    'applika-cli, or python -m pip install --upgrade applika-cli.'
)
DISABLED_LINE = (
    'Updates are turned off by APPLIKA_DISABLE_AUTOUPDATE. Run applika '
    'update --force to update anyway.'
)


class Pypi:
    """A PyPI that answers ``latest`` and records every request."""

    def __init__(self, latest='1.2.0', status=200, error=None, body=None):
        self.latest = latest
        self.status = status
        self.error = error
        self.body = body
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        body = self.body
        if body is None:
            body = {'info': {'version': self.latest}}
        return httpx.Response(self.status, json=body)


class FakeRun:
    """Answers the installer and the verify run in turn, recording both."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []

    def __call__(self, argv, timeout):
        self.calls.append((tuple(argv), timeout))
        answer = self.answers.pop(0)
        if isinstance(answer, BaseException):
            raise answer
        return answer


def done(code=0, stdout='', stderr=''):
    return subprocess.CompletedProcess([], code, stdout, stderr)


def state_file():
    return updater._state_dir() / 'update.json'


@pytest.fixture
def store(monkeypatch):
    """Signed out, no URL in the environment: the default URL."""
    holder = SimpleNamespace(store=FakeStore(None))
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: holder.store)
    monkeypatch.delenv('APPLIKA_API_BASE_URL', raising=False)
    return holder


def sign_in(holder, url=DEFAULT_URL):
    session = make_session()
    session.api_base_url = url
    holder.store = FakeStore(session)


def ready(
    monkeypatch,
    *,
    latest='1.2.0',
    installed='1.1.0',
    run=None,
    install=UV_INSTALL,
    env=None,
    pypi=None,
):
    """Default URL, a uv tool install, PyPI answers ``latest``. The streams
    stay the guard's non-TTY ones: ``applika update`` has no terminal
    check."""
    pypi = pypi or Pypi(latest)
    monkeypatch.setattr(updater, '_transport', httpx.MockTransport(pypi))
    run = run if run is not None else FakeRun(done(), done(stdout=latest))
    monkeypatch.setattr(updater, '_run', run)
    monkeypatch.setattr(updater, '_env', lambda: dict(env or {}))
    monkeypatch.setattr(updater, '_now', lambda: NOW)
    monkeypatch.setattr(updater, 'detect_install', lambda: install)
    monkeypatch.setattr(updater, 'installed_version', lambda: installed)
    return pypi, run


def invoke(runner, args, **kwargs):
    return runner.invoke(cli_app.app, args, **kwargs)


def lines(text):
    return text.splitlines()


# --- refusals -------------------------------------------------------------


FORCE = pytest.mark.parametrize(
    'force', [[], ['--force']], ids=['plain', 'force']
)


@FORCE
def test_url_from_the_flag_is_refused(monkeypatch, runner, store, force):
    pypi, run = ready(monkeypatch)

    result = invoke(runner, ['--api-base-url', OTHER_URL, 'update', *force])

    assert result.exit_code == 1
    assert result.stdout == ''
    assert lines(result.stderr) == [URL_FLAG_LINE]
    assert pypi.requests == []
    assert run.calls == []
    assert not state_file().exists()


@FORCE
def test_url_from_the_env_is_refused(monkeypatch, runner, store, force):
    pypi, run = ready(monkeypatch)

    result = invoke(
        runner, ['update', *force], env={'APPLIKA_API_BASE_URL': OTHER_URL}
    )

    assert result.exit_code == 1
    assert lines(result.stderr) == [URL_ENV_LINE]
    assert pypi.requests == []
    assert run.calls == []


@FORCE
def test_url_from_the_session_is_refused(monkeypatch, runner, store, force):
    sign_in(store, OTHER_URL)
    pypi, run = ready(monkeypatch)

    result = invoke(runner, ['update', *force])

    assert result.exit_code == 1
    assert lines(result.stderr) == [URL_SESSION_LINE]
    assert pypi.requests == []
    assert run.calls == []


def test_url_with_a_trailing_slash_is_named_without_it(
    monkeypatch, runner, store
):
    ready(monkeypatch)

    result = invoke(runner, ['--api-base-url', OTHER_URL + '/', 'update'])

    assert lines(result.stderr) == [URL_FLAG_LINE]


def test_default_url_from_the_flag_is_not_refused(monkeypatch, runner, store):
    ready(monkeypatch, latest='1.1.0')

    result = invoke(runner, ['--api-base-url', DEFAULT_URL + '/', 'update'])

    assert result.exit_code == 0
    assert result.stdout == 'applika-cli 1.1.0 is up to date.\n'


@FORCE
@pytest.mark.parametrize(
    ('install', 'line'),
    [(EDITABLE, CHECKOUT_LINE), (UNKNOWN, UNKNOWN_LINE)],
    ids=['source-checkout', 'unknown'],
)
def test_install_method_refusals(
    monkeypatch, runner, store, force, install, line
):
    pypi, run = ready(monkeypatch, install=install)

    result = invoke(runner, ['update', *force])

    assert result.exit_code == 1
    assert result.stdout == ''
    assert lines(result.stderr) == [line]
    assert pypi.requests == []
    assert run.calls == []
    assert not state_file().exists()


@pytest.mark.parametrize('value', ['1', 'true', 'yes'])
def test_disable_env_refuses_and_names_force(monkeypatch, runner, store, value):
    pypi, run = ready(monkeypatch, env={'APPLIKA_DISABLE_AUTOUPDATE': value})

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == [DISABLED_LINE]
    assert pypi.requests == []
    assert run.calls == []


def test_force_lifts_the_disable_env(monkeypatch, runner, store):
    pypi, run = ready(monkeypatch, env={'APPLIKA_DISABLE_AUTOUPDATE': '1'})

    result = invoke(runner, ['update', '--force'])

    assert result.exit_code == 0
    assert result.stdout.endswith('Updated applika-cli 1.1.0 → 1.2.0\n')
    assert len(pypi.requests) == 1
    assert run.calls[0] == (UV_ARGV, 120)


@pytest.mark.parametrize('value', ['', '0', 'false'])
def test_off_values_of_the_disable_env_update(
    monkeypatch, runner, store, value
):
    _, run = ready(monkeypatch, env={'APPLIKA_DISABLE_AUTOUPDATE': value})

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert len(run.calls) == 2


def test_every_blocker_is_listed_in_order(monkeypatch, runner, store):
    pypi, run = ready(
        monkeypatch,
        install=EDITABLE,
        env={'APPLIKA_DISABLE_AUTOUPDATE': '1', 'CI': 'true'},
    )

    result = invoke(runner, ['--api-base-url', OTHER_URL, 'update'])

    assert result.exit_code == 1
    assert result.stdout == ''
    assert lines(result.stderr) == [URL_FLAG_LINE, CHECKOUT_LINE, DISABLED_LINE]
    assert pypi.requests == []
    assert run.calls == []


def test_force_lifts_only_the_env_line(monkeypatch, runner, store):
    ready(
        monkeypatch,
        install=UNKNOWN,
        env={'APPLIKA_DISABLE_AUTOUPDATE': '1'},
    )

    result = invoke(
        runner,
        ['update', '--force'],
        env={'APPLIKA_API_BASE_URL': OTHER_URL},
    )

    assert result.exit_code == 1
    assert lines(result.stderr) == [URL_ENV_LINE, UNKNOWN_LINE]


# --- no terminal check ----------------------------------------------------


def test_updates_in_ci_without_a_terminal(monkeypatch, runner, store):
    # The guard's streams are StringIO: not terminals.
    assert not any(updater._is_tty(s) for s in updater._streams())
    pypi, run = ready(monkeypatch, env={'CI': 'true'})

    result = invoke(runner, ['update'], env={'CI': 'true'})

    assert result.exit_code == 0
    assert 'Cannot update' not in result.stderr
    assert len(pypi.requests) == 1
    assert len(run.calls) == 2


# --- results --------------------------------------------------------------


def test_updates_to_the_latest_release(monkeypatch, runner, store):
    pypi, run = ready(monkeypatch)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert result.stderr == ''
    assert result.stdout == (
        'Updating applika-cli 1.1.0 → 1.2.0 (uv tool upgrade applika-cli)…\n'
        'Updated applika-cli 1.1.0 → 1.2.0\n'
    )
    assert [str(r.url) for r in pypi.requests] == [updater.PYPI_JSON_URL]
    assert pypi.requests[0].extensions['timeout']['read'] == 10
    assert pypi.requests[0].extensions['timeout']['connect'] == 10
    assert run.calls[0] == (UV_ARGV, 120)
    assert run.calls[1][0] == updater.VERIFY_ARGV


@pytest.mark.parametrize(
    ('install', 'shown'),
    [
        (PIPX_INSTALL, 'pipx upgrade applika-cli'),
        (PIP_INSTALL, ' '.join(PIP_ARGV)),
    ],
    ids=['pipx', 'pip'],
)
def test_updates_with_the_detected_tool(
    monkeypatch, runner, store, install, shown
):
    _, run = ready(monkeypatch, install=install)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert f'({shown})…' in result.stdout
    assert run.calls[0][0] == install.argv


def test_arrow_and_dots_fall_back_on_an_ascii_stdout(monkeypatch, store):
    ready(monkeypatch)

    result = invoke(CliRunner(charset='ascii'), ['update'])

    assert result.exit_code == 0
    assert result.stdout == (
        'Updating applika-cli 1.1.0 -> 1.2.0 (uv tool upgrade applika-cli)...\n'
        'Updated applika-cli 1.1.0 -> 1.2.0\n'
    )


@pytest.mark.parametrize(
    ('installed', 'latest'),
    [('1.2.0', '1.2.0'), ('1.2', '1.2.0'), ('1.3.0', '1.2.0')],
    ids=['equal', 'padded-equal', 'installed-newer'],
)
def test_up_to_date(monkeypatch, runner, store, installed, latest):
    _, run = ready(monkeypatch, installed=installed, latest=latest)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert result.stdout == f'applika-cli {installed} is up to date.\n'
    assert result.stderr == ''
    assert run.calls == []


@pytest.mark.parametrize(
    ('installed', 'latest'),
    [('1.1.0', '1.2.0rc1'), ('unknown', '1.2.0')],
    ids=['pre-release', 'unknown-installed'],
)
def test_not_comparable(monkeypatch, runner, store, installed, latest):
    _, run = ready(monkeypatch, installed=installed, latest=latest)

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert result.stdout == ''
    assert lines(result.stderr) == [
        f'Cannot compare installed {installed} with published {latest}.'
    ]
    assert run.calls == []


def test_failed_install_shows_code_tail_and_command(monkeypatch, runner, store):
    stderr = '\n'.join(f'line {n}' for n in range(1, 26))
    _, run = ready(monkeypatch, run=FakeRun(done(code=2, stderr=stderr)))

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert result.stdout.startswith('Updating applika-cli 1.1.0 → 1.2.0')
    assert lines(result.stderr) == [
        f'Update failed: {UV_LINE} exited 2.',
        *(f'line {n}' for n in range(6, 26)),
        f'Run it yourself: {UV_LINE}',
    ]
    assert len(run.calls) == 1


def test_installer_timeout(monkeypatch, runner, store):
    ready(monkeypatch, run=FakeRun(subprocess.TimeoutExpired(UV_ARGV, 120)))

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == [
        f'Update failed: {UV_LINE} timed out after 120 s.',
        f'Run it yourself: {UV_LINE}',
    ]


def test_verify_timeout_says_the_installer_ran(monkeypatch, runner, store):
    ready(
        monkeypatch,
        run=FakeRun(done(), subprocess.TimeoutExpired(['python'], 1)),
    )

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == [
        f'Update failed: {UV_LINE} ran, but the new version could not be '
        'confirmed within 120 s.',
        f'Run it yourself: {UV_LINE}',
    ]
    assert 'exited 0' not in result.stderr


def test_failed_verify_says_the_installer_ran(monkeypatch, runner, store):
    ready(
        monkeypatch,
        run=FakeRun(
            done(), done(code=1, stderr='Traceback\nPackageNotFoundError')
        ),
    )

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == [
        f'Update failed: {UV_LINE} ran, but the new version could not be '
        'confirmed.',
        'Traceback',
        'PackageNotFoundError',
        f'Run it yourself: {UV_LINE}',
    ]
    assert 'exited 0' not in result.stderr


@pytest.mark.parametrize(
    ('install', 'tool'),
    [(UV_INSTALL, 'uv'), (PIPX_INSTALL, 'pipx'), (PIP_INSTALL, 'pip')],
    ids=['uv', 'pipx', 'pip'],
)
def test_kept_by_a_pin(monkeypatch, runner, store, install, tool):
    ready(
        monkeypatch, install=install, run=FakeRun(done(), done(stdout='1.1.0'))
    )

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == [
        f'{tool} kept applika-cli 1.1.0: your install pins that version. '
        'Reinstall without the pin to update.'
    ]
    assert 'Updated' not in result.stdout


@pytest.mark.parametrize('stdout', ['', 'garbage', '1.2.0rc1'])
def test_unreadable_verify_output_is_a_failure_not_a_pin(
    monkeypatch, runner, store, stdout
):
    ready(monkeypatch, run=FakeRun(done(), done(stdout=stdout)))

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == [
        f'Update failed: {UV_LINE} ran, but the new version could not be '
        f'confirmed: the installed version reads {stdout!r}, not 1.2.0.',
        f'Run it yourself: {UV_LINE}',
    ]
    assert 'kept' not in result.stderr


def test_pypi_down(monkeypatch, runner, store):
    error = httpx.ConnectError('network down')
    _, run = ready(monkeypatch, pypi=Pypi(error=error))

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert result.stdout == ''
    assert lines(result.stderr) == ['Could not reach PyPI: network down']
    assert run.calls == []


def test_pypi_error_status_keeps_one_line(monkeypatch, runner, store):
    ready(monkeypatch, pypi=Pypi(status=503))

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert len(lines(result.stderr)) == 1
    assert result.stderr.startswith('Could not reach PyPI: Server error')
    assert '503' in result.stderr


@pytest.mark.parametrize(
    ('body', 'reason'),
    [
        ({'info': {}}, 'its answer has no info.version'),
        ({'nope': 1}, 'PyPI body has no info object'),
    ],
    ids=['no-version', 'no-info'],
)
def test_pypi_body_without_a_version(monkeypatch, runner, store, body, reason):
    ready(monkeypatch, pypi=Pypi(body=body))

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert result.stderr.startswith(f'Could not reach PyPI: {reason}')


# --- lock and clock -------------------------------------------------------


def test_lock_held_by_another_update(monkeypatch, runner, store):
    pypi, run = ready(monkeypatch)
    lock = updater._state_dir() / 'update.lock'
    lock.parent.mkdir(parents=True)
    lock.touch()

    result = invoke(runner, ['update'])

    assert result.exit_code == 1
    assert lines(result.stderr) == ['Another applika update is running.']
    assert pypi.requests == []
    assert run.calls == []
    assert lock.exists()  # someone else's lock stays
    assert not state_file().exists()


def test_lock_is_released_after_the_update(monkeypatch, runner, store):
    ready(monkeypatch)

    invoke(runner, ['update'])

    assert not (updater._state_dir() / 'update.lock').exists()


@pytest.mark.parametrize(
    ('pypi', 'latest_saved'),
    [
        (Pypi('1.2.0'), '1.2.0'),
        (Pypi('1.1.0'), '1.1.0'),
        (Pypi(error=httpx.ConnectError('down')), None),
    ],
    ids=['newer', 'up-to-date', 'failed'],
)
def test_every_check_restarts_the_clock(
    monkeypatch, runner, store, pypi, latest_saved
):
    # A record from an hour ago: the auto update would not check again.
    state_file().parent.mkdir(parents=True)
    UpdateState(datetime(2026, 10, 19, 11, 0, tzinfo=timezone.utc)).save()
    ready(monkeypatch, pypi=pypi)

    invoke(runner, ['update'])

    assert UpdateState.load() == UpdateState(NOW, latest_saved)


def test_checked_at_is_saved_before_the_network_call(
    monkeypatch, runner, store
):
    seen = []

    def pypi(request):
        seen.append(json.loads(state_file().read_text()))
        return httpx.Response(200, json={'info': {'version': '1.1.0'}})

    ready(monkeypatch, pypi=pypi)

    invoke(runner, ['update'])

    assert seen == [
        {'checked_at': '2026-10-19T12:00:00+00:00', 'latest_version': None}
    ]


def test_an_unwritable_record_does_not_stop_the_update(
    monkeypatch, runner, store
):
    def refuse(self):
        raise PermissionError('read-only')

    monkeypatch.setattr(UpdateState, 'save', refuse)
    _, run = ready(monkeypatch)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert len(run.calls) == 2


# --- no auto update after it ----------------------------------------------


def test_no_auto_update_after_update(monkeypatch, runner, store):
    seen = []
    monkeypatch.setattr(updater, 'after_command', seen.append)
    # Interactive: the auto update would run if it were registered.
    monkeypatch.setattr(
        updater, '_streams', lambda: tuple(Tty() for _ in range(3))
    )
    pypi, run = ready(monkeypatch)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert seen == []
    assert len(pypi.requests) == 1
    assert len(run.calls) == 2


def test_no_auto_update_after_a_refused_update(monkeypatch, runner, store):
    seen = []
    monkeypatch.setattr(updater, 'after_command', seen.append)
    ready(monkeypatch, install=EDITABLE)

    invoke(runner, ['update'])

    assert seen == []


def test_other_commands_still_get_the_auto_update(monkeypatch, runner, store):
    seen = []
    monkeypatch.setattr(updater, 'after_command', seen.append)

    invoke(runner, ['whoami'])

    assert len(seen) == 1


class Tty(io.StringIO):
    def isatty(self):
        return True


def test_one_check_even_when_the_daily_update_is_due(
    monkeypatch, runner, store
):
    # The real after_command, interactive and due: still one fetch.
    monkeypatch.setattr(
        updater, '_streams', lambda: tuple(Tty() for _ in range(3))
    )
    pypi, run = ready(monkeypatch, latest='1.1.0')
    monkeypatch.setattr(UpdateState, 'save', lambda self: None)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert len(pypi.requests) == 1
    assert run.calls == []


# --- signed out, no Applika API -------------------------------------------


def test_works_signed_out_without_the_applika_api(monkeypatch, runner, store):
    built = []
    monkeypatch.setattr(
        api_module.ApiClient, '__init__', lambda *a, **k: built.append(a)
    )
    pypi, _ = ready(monkeypatch)

    result = invoke(runner, ['update'])

    assert result.exit_code == 0
    assert built == []
    assert [r.url.host for r in pypi.requests] == ['pypi.org']
    assert store.store.saved is None


def test_update_module_never_uses_the_session_or_the_api_client():
    source = inspect.getsource(update_module)

    assert 'require_session' not in source
    assert 'ApiClient' not in source


# --- help -----------------------------------------------------------------


def test_root_help_lists_update(runner):
    result = invoke(runner, ['--help'])

    assert result.exit_code == 0
    assert 'update' in result.stdout
    assert 'Update applika-cli to the latest version on PyPI.' in result.stdout


def test_update_help_lists_force(runner):
    result = invoke(runner, ['update', '--help'])

    assert result.exit_code == 0
    assert '--force' in result.stdout
    assert 'Changes nothing else.' in result.stdout


# --- where the URL comes from ---------------------------------------------


def capture_config(monkeypatch):
    seen = []
    real = updater.blockers

    def spy(config, *args, **kwargs):
        seen.append(config)
        return real(config, *args, **kwargs)

    monkeypatch.setattr(updater, 'blockers', spy)
    return seen


@pytest.mark.parametrize(
    ('how', 'expected'),
    [
        ('flag', ApiBaseUrlSource.FLAG),
        ('env', ApiBaseUrlSource.ENV),
        ('flag-and-env', ApiBaseUrlSource.FLAG),
        ('session', ApiBaseUrlSource.SESSION),
        ('env-and-session', ApiBaseUrlSource.ENV),
        ('default', ApiBaseUrlSource.DEFAULT),
    ],
)
def test_the_url_source_through_the_cli(
    monkeypatch, runner, store, how, expected
):
    if 'session' in how:
        sign_in(store, OTHER_URL)
    args = ['update']
    if 'flag' in how:
        args = ['--api-base-url', OTHER_URL, *args]
    env = {'APPLIKA_API_BASE_URL': OTHER_URL} if 'env' in how else None
    seen = capture_config(monkeypatch)
    ready(monkeypatch, install=EDITABLE)

    invoke(runner, args, env=env)

    assert [config.api_base_url_source for config in seen] == [expected]


def test_resolver_sources(monkeypatch):
    monkeypatch.delenv('APPLIKA_API_BASE_URL', raising=False)
    session = make_session()
    signed_in = FakeStore(session)
    flag = ApiBaseUrlSource.FLAG

    assert resolve_api_base_url_with_source(
        'https://x/api/', flag, signed_in
    ) == (
        'https://x/api',
        ApiBaseUrlSource.FLAG,
    )
    assert resolve_api_base_url_with_source(
        'https://x/api', ApiBaseUrlSource.ENV, signed_in
    ) == ('https://x/api', ApiBaseUrlSource.ENV)
    assert resolve_api_base_url_with_source(None, flag, signed_in) == (
        session.api_base_url,
        ApiBaseUrlSource.SESSION,
    )
    assert resolve_api_base_url_with_source('', flag, FakeStore()) == (
        DEFAULT_URL,
        ApiBaseUrlSource.DEFAULT,
    )
    monkeypatch.setenv('APPLIKA_API_BASE_URL', 'https://env/api/')
    assert resolve_api_base_url_with_source(None, flag, signed_in) == (
        'https://env/api',
        ApiBaseUrlSource.ENV,
    )


def test_resolve_api_base_url_keeps_its_signature(monkeypatch):
    monkeypatch.delenv('APPLIKA_API_BASE_URL', raising=False)

    assert list(inspect.signature(resolve_api_base_url).parameters) == [
        'explicit_value',
        'store',
    ]
    assert (
        resolve_api_base_url('https://x/api/', FakeStore()) == 'https://x/api'
    )
    assert resolve_api_base_url(None, FakeStore()) == DEFAULT_URL


def test_app_config_keeps_its_two_argument_constructor():
    config = AppConfig(api_base_url=DEFAULT_URL, store=FakeStore())

    assert config.api_base_url_source is ApiBaseUrlSource.DEFAULT


def test_source_values_are_strings():
    assert [source.value for source in ApiBaseUrlSource] == [
        'flag',
        'env',
        'session',
        'default',
    ]
    assert ApiBaseUrlSource.FLAG == 'flag'


# --- lines and command lines ----------------------------------------------


def test_url_line_without_a_known_source():
    blocker = Blocker(
        BlockerKind.URL_OVERRIDDEN, OTHER_URL, ApiBaseUrlSource.DEFAULT
    )

    assert update_module.blocker_line(blocker) == (
        'Cannot update: the API base URL is http://127.0.0.1:8000/api, not '
        'https://applika.dev/api. --force does not change this. Use '
        'https://applika.dev/api.'
    )


def test_the_terminal_gate_has_a_line_too():
    blocker = Blocker(BlockerKind.NOT_INTERACTIVE, 'CI is set')

    assert update_module.blocker_line(blocker) == (
        'Cannot update: not_interactive (CI is set).'
    )


def test_command_line_quotes_a_path_with_spaces():
    argv = ('/opt/my python/bin/python', '-m', 'pip', 'install')

    assert update_module._command_line(argv) == (
        "'/opt/my python/bin/python' -m pip install"
    )


def test_command_line_on_windows(monkeypatch):
    monkeypatch.setattr(update_module, 'os', SimpleNamespace(name='nt'))
    argv = ('C:\\Program Files\\Python\\python.exe', '-m', 'pip')

    assert update_module._command_line(argv) == (
        '"C:\\Program Files\\Python\\python.exe" -m pip'
    )
