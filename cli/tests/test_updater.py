import io
import json
import os
import stat
import subprocess
import sys
from contextlib import contextmanager, suppress
from datetime import datetime, timedelta, timezone
from importlib.metadata import PackageNotFoundError, PathDistribution

import httpx
import pytest
import typer
from conftest import FakeStore, make_session

import applika.app as cli_app
import applika.commands.version as version_module
from applika.config import (
    ApiBaseUrlSource,
    AppConfig,
    is_default_api_base_url,
)
from applika.lib import updater
from applika.lib.updater import (
    Blocker,
    BlockerKind,
    Install,
    InstallResult,
    UpdateState,
)
from applika.lib.updater import _run as real_run
from applika.lib.updater import _state_dir as real_state_dir

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)


def use_pypi(monkeypatch, handler):
    monkeypatch.setattr(updater, '_transport', httpx.MockTransport(handler))


def state_file():
    return updater._state_dir() / 'update.json'


def lock_file():
    return updater._state_dir() / 'update.lock'


# --- versions -------------------------------------------------------------


@pytest.mark.parametrize(
    ('value', 'expected'),
    [
        ('1', (1,)),
        ('1.2', (1, 2)),
        ('1.2.0', (1, 2, 0)),
        ('10.0.11', (10, 0, 11)),
        ('1.2.0rc1', None),
        ('1.2.0.dev1', None),
        ('v1.2.0', None),
        ('1..2', None),
        ('1.2.', None),
        ('1.2.0\n', None),
        ('', None),
        ('garbage', None),
        ('unknown', None),
        (None, None),
    ],
)
def test_parse_release(value, expected):
    assert updater.parse_release(value) == expected


@pytest.mark.parametrize(
    ('latest', 'installed', 'expected'),
    [
        ('1.2.0', '1.2.0', False),
        ('1.2', '1.2.0', False),
        ('1.2.0', '1.2', False),
        ('1.2.1', '1.2', True),
        ('1.3', '1.2.9', True),
        ('1.10.0', '1.9.0', True),
        ('2.0.0', '1.9.9', True),
        ('1.1.0', '1.2.0', False),
        ('1.2', '1.2.0.1', False),
        ('1.2.0rc1', '1.1.0', None),
        ('1.2.0', '1.2.0rc1', None),
        ('garbage', '1.2.0', None),
        ('1.2.0', 'unknown', None),
    ],
)
def test_is_newer(latest, installed, expected):
    assert updater.is_newer(latest, installed) is expected


def test_installed_newer_than_pypi_counts_as_up_to_date():
    # A local build ahead of PyPI never reads as an update.
    assert updater.is_newer('1.1.0', '1.2.0') is False
    assert updater.is_newer('1.1.0', '1.1.1') is False
    assert updater.is_newer('1', '1.0.1') is False


def test_installed_version_reads_metadata(monkeypatch):
    seen = []

    def fake_version(name):
        seen.append(name)
        return '9.9.9'

    monkeypatch.setattr(updater, 'package_version', fake_version)

    assert updater.installed_version() == '9.9.9'
    assert seen == ['applika-cli']


def test_installed_version_unknown_when_not_installed(monkeypatch):
    def missing(name):
        raise updater.PackageNotFoundError(name)

    monkeypatch.setattr(updater, 'package_version', missing)

    assert updater.installed_version() == 'unknown'


def test_version_command_reads_the_moved_url():
    assert updater.PYPI_JSON_URL == 'https://pypi.org/pypi/applika-cli/json'
    assert version_module.PYPI_JSON_URL is updater.PYPI_JSON_URL


def test_updater_never_imports_the_commands_package():
    code = (
        'import sys, applika.lib.updater; '
        "print([m for m in sys.modules if m.startswith('applika.commands')])"
    )
    result = subprocess.run(
        [sys.executable, '-c', code],
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.strip() == '[]'


# --- PyPI read ------------------------------------------------------------


def test_fetch_latest_reads_info_version(monkeypatch):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={'info': {'version': '1.4.2'}})

    use_pypi(monkeypatch, handler)

    assert updater.fetch_latest(timeout=3) == '1.4.2'
    assert len(seen) == 1
    assert seen[0].method == 'GET'
    assert str(seen[0].url) == 'https://pypi.org/pypi/applika-cli/json'
    assert seen[0].extensions['timeout'] == {
        'connect': 3,
        'read': 3,
        'write': 3,
        'pool': 3,
    }


def test_fetch_latest_raises_on_http_error(monkeypatch):
    use_pypi(monkeypatch, lambda request: httpx.Response(500))

    with pytest.raises(httpx.HTTPStatusError):
        updater.fetch_latest(timeout=3)


def test_fetch_latest_raises_on_bad_json(monkeypatch):
    use_pypi(monkeypatch, lambda request: httpx.Response(200, text='<html>'))

    with pytest.raises(json.JSONDecodeError):
        updater.fetch_latest(timeout=3)


@pytest.mark.parametrize(
    'body',
    [{}, [], {'info': None}, {'info': 'x'}, {'info': []}],
)
def test_fetch_latest_raises_value_error_without_info_object(monkeypatch, body):
    use_pypi(monkeypatch, lambda request: httpx.Response(200, json=body))

    with pytest.raises(ValueError, match='no info object'):
        updater.fetch_latest(timeout=3)


@pytest.mark.parametrize(
    'body',
    [{'info': {}}, {'info': {'name': 'applika-cli'}}],
)
def test_fetch_latest_raises_without_info_version(monkeypatch, body):
    use_pypi(monkeypatch, lambda request: httpx.Response(200, json=body))

    with pytest.raises(KeyError):
        updater.fetch_latest(timeout=3)


def test_fetch_latest_raises_on_non_string_version(monkeypatch):
    use_pypi(
        monkeypatch,
        lambda request: httpx.Response(200, json={'info': {'version': 12}}),
    )

    with pytest.raises(ValueError, match='not a string'):
        updater.fetch_latest(timeout=3)


def test_fetch_latest_raises_on_connect_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError('network down', request=request)

    use_pypi(monkeypatch, handler)

    with pytest.raises(httpx.ConnectError):
        updater.fetch_latest(timeout=3)


# --- installer runner -----------------------------------------------------


def test_run_passes_argv_without_a_shell():
    result = real_run(
        [sys.executable, '-c', 'import sys; print(sys.argv[1])', 'a; echo b'],
        timeout=30,
    )

    assert result.returncode == 0
    assert result.stdout == 'a; echo b\n'


def test_run_reports_exit_code_without_raising():
    result = real_run(
        [sys.executable, '-c', 'import sys; sys.exit(3)'], timeout=30
    )

    assert result.returncode == 3


def test_run_honours_the_timeout():
    with pytest.raises(subprocess.TimeoutExpired):
        real_run(
            [sys.executable, '-c', 'import time; time.sleep(30)'],
            timeout=0.5,
        )


# --- update record --------------------------------------------------------


def test_state_dir_is_the_session_folder(monkeypatch, tmp_path):
    monkeypatch.setattr(updater.Path, 'home', lambda: tmp_path / 'home')

    assert real_state_dir() == tmp_path / 'home' / '.config' / 'applika'


def test_guard_points_the_state_dir_at_tmp(tmp_path):
    assert updater._state_dir() == tmp_path / 'applika-config'


def test_missing_record_is_never_checked():
    state = UpdateState.load()

    assert state.checked_at is None
    assert state.latest_version is None
    assert state.due(NOW) is True


@pytest.mark.parametrize(
    'content',
    [
        '{not json',
        '',
        '[]',
        '"2026-10-19T12:00:00+00:00"',
        '{}',
        '{"latest_version": "1.2.0"}',
        '{"checked_at": "yesterday", "latest_version": "1.2.0"}',
        '{"checked_at": 1760000000, "latest_version": "1.2.0"}',
        '{"checked_at": "2026-10-19T11:00:00", "latest_version": "1.2.0"}',
        '{"checked_at": "2026-10-19T11:00:00+00:00", "latest_version": 12}',
    ],
)
def test_damaged_record_is_never_checked(content):
    state_file().parent.mkdir(parents=True)
    state_file().write_text(content)

    state = UpdateState.load()

    assert state.checked_at is None
    assert state.due(NOW) is True


def test_undecodable_record_is_never_checked():
    state_file().parent.mkdir(parents=True)
    state_file().write_bytes(b'\xff\xfe\x00garbage')

    assert UpdateState.load().due(NOW) is True


@pytest.mark.skipif(
    sys.platform == 'win32' or os.geteuid() == 0,
    reason='file modes do not block reads on Windows or as root',
)
def test_unreadable_record_is_never_checked():
    UpdateState(NOW - timedelta(hours=1), '1.2.0').save()
    state_file().chmod(0)
    try:
        state = UpdateState.load()
    finally:
        state_file().chmod(0o644)

    assert state.checked_at is None
    assert state.due(NOW) is True


def test_record_23_hours_old_is_not_due():
    UpdateState(NOW - timedelta(hours=23), '1.2.0').save()

    assert UpdateState.load().due(NOW) is False


def test_record_just_under_24_hours_is_not_due():
    UpdateState(NOW - timedelta(hours=24) + timedelta(seconds=1), None).save()

    assert UpdateState.load().due(NOW) is False


def test_record_24_hours_old_is_due():
    UpdateState(NOW - timedelta(hours=24), '1.2.0').save()

    assert UpdateState.load().due(NOW) is True


def test_failed_check_still_counts_for_the_day():
    # A check whose PyPI read failed saves its start time with no version.
    UpdateState(NOW - timedelta(hours=2), None).save()

    state = UpdateState.load()

    assert state.checked_at == NOW - timedelta(hours=2)
    assert state.latest_version is None
    assert state.due(NOW) is False


def test_save_writes_both_keys_in_utc():
    plus_two = timezone(timedelta(hours=2))
    UpdateState(datetime(2026, 10, 19, 14, 0, tzinfo=plus_two), '1.4.2').save()

    data = json.loads(state_file().read_text())

    assert data == {
        'checked_at': '2026-10-19T12:00:00+00:00',
        'latest_version': '1.4.2',
    }
    assert UpdateState.load() == UpdateState(NOW, '1.4.2')


def test_save_writes_null_latest_version():
    UpdateState(NOW, None).save()

    data = json.loads(state_file().read_text())

    assert data == {
        'checked_at': '2026-10-19T12:00:00+00:00',
        'latest_version': None,
    }


@pytest.mark.skipif(sys.platform == 'win32', reason='POSIX file modes')
def test_save_sets_mode_0644():
    UpdateState(NOW, '1.4.2').save()

    assert stat.S_IMODE(state_file().stat().st_mode) == 0o644


def test_save_replaces_atomically_and_leaves_no_temp_file(monkeypatch):
    UpdateState(NOW - timedelta(hours=30), '1.0.0').save()
    before = state_file().read_text()
    replaced = []

    def failing_replace(src, dst):
        replaced.append((os.path.dirname(src), str(dst)))
        raise OSError('disk full')

    monkeypatch.setattr(updater.os, 'replace', failing_replace)

    with pytest.raises(OSError, match='disk full'):
        UpdateState(NOW, '1.4.2').save()

    # The new content went to a temp file beside the record, then replace.
    assert replaced == [(str(state_file().parent), str(state_file()))]
    assert state_file().read_text() == before
    assert sorted(p.name for p in state_file().parent.iterdir()) == [
        'update.json'
    ]


def test_save_creates_the_folder_and_only_the_record():
    UpdateState(NOW, '1.4.2').save()

    assert sorted(p.name for p in updater._state_dir().iterdir()) == [
        'update.json'
    ]


def test_save_without_checked_at_is_refused():
    with pytest.raises(ValueError, match='checked_at is required'):
        UpdateState().save()

    assert not state_file().exists()


# --- lock -----------------------------------------------------------------


def test_free_lock_is_acquired_and_released():
    with updater.update_lock() as acquired:
        assert acquired is True
        assert lock_file().exists()

    assert not lock_file().exists()


def test_lock_is_released_when_the_block_raises():
    seen = []

    def install_inside_lock():
        with updater.update_lock() as acquired:
            seen.append((acquired, lock_file().exists()))
            raise RuntimeError('install failed')

    with pytest.raises(RuntimeError, match='install failed'):
        install_inside_lock()

    assert seen == [(True, True)]
    assert not lock_file().exists()


def test_second_acquirer_while_held_is_not_acquired():
    with updater.update_lock() as first:
        with updater.update_lock() as second:
            assert first is True
            assert second is False
        # The loser never removes the winner's lock.
        assert lock_file().exists()

    assert not lock_file().exists()


def hold_lock(age_seconds, now):
    lock_file().parent.mkdir(parents=True, exist_ok=True)
    lock_file().write_text('')
    os.utime(lock_file(), (now - age_seconds, now - age_seconds))


def test_fresh_held_lock_is_not_acquired():
    now = 1_800_000_000.0
    hold_lock(5, now)

    with updater.update_lock(now=lambda: now) as acquired:
        assert acquired is False

    assert lock_file().exists()


def test_lock_exactly_600_seconds_old_is_still_held():
    now = 1_800_000_000.0
    hold_lock(600, now)

    with updater.update_lock(now=lambda: now) as acquired:
        assert acquired is False

    assert lock_file().exists()


def test_stale_lock_601_seconds_old_is_taken_over():
    now = 1_800_000_000.0
    hold_lock(601, now)

    with updater.update_lock(now=lambda: now) as acquired:
        assert acquired is True
        assert lock_file().exists()

    assert not lock_file().exists()


def test_stale_lock_retaken_by_someone_else_is_not_acquired(monkeypatch):
    # Retry once only: when the second create also finds a lock, skip.
    now = 1_800_000_000.0
    hold_lock(601, now)
    path = lock_file()
    real_unlink = updater.Path.unlink

    def unlink_then_another_process_takes_it(self, *args, **kwargs):
        real_unlink(self, *args, **kwargs)
        self.write_text('')

    monkeypatch.setattr(
        updater.Path, 'unlink', unlink_then_another_process_takes_it
    )

    with updater.update_lock(now=lambda: now) as acquired:
        assert acquired is False

    assert path.exists()


def test_lock_vanishing_before_stat_is_retried_once(monkeypatch):
    # The holder released between our failed create and our stat.
    now = 1_800_000_000.0
    hold_lock(5, now)
    path = lock_file()
    real_stat = updater.Path.stat

    def stat_after_release(self, *args, **kwargs):
        if self == path:
            os.unlink(path)
        return real_stat(self, *args, **kwargs)

    monkeypatch.setattr(updater.Path, 'stat', stat_after_release)

    with updater.update_lock(now=lambda: now) as acquired:
        assert acquired is True

    assert not os.path.exists(path)


# --- the conftest guards --------------------------------------------------


def take_failure(guard):
    try:
        guard.check()
    except BaseException as exc:  # pytest outcomes are BaseException
        return exc
    return None


def test_guard_fails_a_test_that_fetches_without_its_own_transport(
    updater_guard,
):
    # The auto update swallows every error, so the refusal alone is lost.
    with suppress(Exception):
        updater.fetch_latest(timeout=3)

    requests = list(updater_guard.requests)
    failure = take_failure(updater_guard)
    updater_guard.requests.clear()  # this test's own teardown stays green

    assert requests == ['https://pypi.org/pypi/applika-cli/json']
    assert type(failure) is pytest.fail.Exception
    assert 'PyPI requests' in str(failure)


def test_guard_fails_a_test_that_runs_an_installer(updater_guard):
    with suppress(Exception):
        updater._run(['pip', 'install', '--upgrade', 'applika-cli'], 120)

    runs = list(updater_guard.runs)
    failure = take_failure(updater_guard)
    updater_guard.runs.clear()

    assert runs == [['pip', 'install', '--upgrade', 'applika-cli']]
    assert type(failure) is pytest.fail.Exception
    assert 'installer runs' in str(failure)


def test_guard_stays_quiet_when_the_test_installs_its_own_seams(
    monkeypatch, updater_guard
):
    use_pypi(
        monkeypatch,
        lambda request: httpx.Response(200, json={'info': {'version': '2'}}),
    )
    monkeypatch.setattr(updater, '_run', lambda argv, timeout: None)

    assert updater.fetch_latest(timeout=3) == '2'
    updater._run(['pip', 'install', 'applika-cli'], 120)

    assert updater_guard.requests == []
    assert updater_guard.runs == []
    assert take_failure(updater_guard) is None


def test_record_started_in_the_future_is_due():
    # The clock moved back or the record was edited: not a valid start.
    UpdateState(NOW + timedelta(hours=1), '1.2.0').save()

    assert UpdateState.load().due(NOW) is True


def test_record_started_exactly_now_is_not_due():
    UpdateState(NOW, '1.2.0').save()

    assert UpdateState.load().due(NOW) is False


# --- install detection ----------------------------------------------------


def make_dist(root, *, direct_url=None, installer=None):
    """A real ``applika-cli`` dist-info folder under ``root``."""
    info = root / 'applika_cli-1.1.0.dist-info'
    info.mkdir(parents=True)
    (info / 'METADATA').write_text(
        'Metadata-Version: 2.1\nName: applika-cli\nVersion: 1.1.0\n'
    )
    if direct_url is not None:
        (info / 'direct_url.json').write_text(
            direct_url
            if isinstance(direct_url, str)
            else json.dumps(direct_url)
        )
    if installer is not None:
        (info / 'INSTALLER').write_text(installer)
    return PathDistribution(info)


def detect(tmp_path, dist, *, markers=(), tools=(), user_site=None):
    prefix = tmp_path / 'prefix'
    prefix.mkdir(exist_ok=True)
    for marker in markers:
        (prefix / marker).write_text('')
    asked = []

    def distribution(name):
        asked.append(name)
        if dist is None:
            raise PackageNotFoundError(name)
        return dist

    detected = updater.detect_install(
        distribution=distribution,
        prefix=lambda: prefix,
        which=lambda command: f'/bin/{command}' if command in tools else None,
        user_site=lambda: str(user_site or tmp_path / 'user-site'),
    )
    assert asked == ['applika-cli']
    return detected


SITE = 'site-packages'
UV_ARGV = ('uv', 'tool', 'upgrade', 'applika-cli')
PIPX_ARGV = ('pipx', 'upgrade', 'applika-cli')
PIP_ARGV = (sys.executable, '-m', 'pip', 'install', '--upgrade', 'applika-cli')
EVERYTHING = {
    'markers': ('uv-receipt.toml', 'pipx_metadata.json'),
    'tools': ('uv', 'pipx'),
}


def test_editable_install_is_a_source_checkout(tmp_path):
    dist = make_dist(
        tmp_path / SITE,
        direct_url={
            'url': 'file:///home/me/applika/cli',
            'dir_info': {'editable': True},
        },
        installer='uv',
    )

    detected = detect(tmp_path, dist, **EVERYTHING)

    assert detected == Install('editable', (), '/home/me/applika/cli')


def test_editable_flag_without_a_file_url_is_a_source_checkout(tmp_path):
    dist = make_dist(
        tmp_path / SITE,
        direct_url={
            'url': 'https://example.com/applika',
            'dir_info': {'editable': True},
        },
        installer='pip',
    )

    assert detect(tmp_path, dist, **EVERYTHING).method == 'editable'


def test_local_file_install_is_a_source_checkout(tmp_path):
    # ``uv tool install --force .`` lands here: not editable, a file: URL.
    dist = make_dist(
        tmp_path / SITE,
        direct_url={
            'url': 'file:///home/me/my%20code/cli',
            'dir_info': {},
        },
        installer='uv',
    )

    detected = detect(tmp_path, dist, **EVERYTHING)

    assert detected == Install('editable', (), '/home/me/my code/cli')


def test_remote_direct_url_is_not_a_source_checkout(tmp_path):
    dist = make_dist(
        tmp_path / SITE,
        direct_url={
            'url': 'https://files.example/applika_cli-1.1.0.whl',
            'archive_info': {},
        },
        installer='uv',
    )

    detected = detect(tmp_path, dist, **EVERYTHING)

    assert detected.method == 'uv_tool'


def test_damaged_direct_url_is_ignored(tmp_path):
    dist = make_dist(tmp_path / SITE, direct_url='{not json', installer='pip')

    assert detect(tmp_path, dist).argv == PIP_ARGV


def test_uv_tool_install(tmp_path):
    dist = make_dist(tmp_path / SITE, installer='uv')

    detected = detect(tmp_path, dist, **EVERYTHING)

    assert detected.method == 'uv_tool'
    assert detected.argv == UV_ARGV
    assert detected.detail == str(tmp_path / 'prefix' / 'uv-receipt.toml')


def test_uv_receipt_without_uv_on_path_is_unknown(tmp_path):
    # pipx and pip markers present too: no fall-through to another tool.
    dist = make_dist(tmp_path / SITE, installer='pip')

    detected = detect(
        tmp_path,
        dist,
        markers=('uv-receipt.toml', 'pipx_metadata.json'),
        tools=('pipx',),
    )

    assert detected.method == 'unknown'
    assert detected.argv == ()
    assert 'uv not on PATH' in detected.detail


def test_pipx_install(tmp_path):
    dist = make_dist(tmp_path / SITE, installer='pip')

    detected = detect(
        tmp_path, dist, markers=('pipx_metadata.json',), tools=('uv', 'pipx')
    )

    assert detected.method == 'pipx'
    assert detected.argv == PIPX_ARGV


def test_pipx_metadata_without_pipx_on_path_is_unknown(tmp_path):
    dist = make_dist(tmp_path / SITE, installer='pip')

    detected = detect(
        tmp_path, dist, markers=('pipx_metadata.json',), tools=('uv',)
    )

    assert detected.method == 'unknown'
    assert 'pipx not on PATH' in detected.detail


def test_pip_install(tmp_path):
    dist = make_dist(tmp_path / SITE, installer='pip\n')

    detected = detect(tmp_path, dist, tools=('uv', 'pipx'))

    assert detected.method == 'pip'
    assert detected.argv == PIP_ARGV
    assert detected.detail == str(tmp_path / SITE)


def test_pip_user_install_adds_user(tmp_path):
    dist = make_dist(tmp_path / 'user-site', installer='pip')

    detected = detect(tmp_path, dist, user_site=tmp_path / 'user-site')

    assert detected.argv == (
        sys.executable,
        '-m',
        'pip',
        'install',
        '--upgrade',
        '--user',
        'applika-cli',
    )


def test_pip_outside_the_user_site_has_no_user(tmp_path):
    dist = make_dist(tmp_path / SITE, installer='pip')

    detected = detect(tmp_path, dist, user_site=tmp_path / 'user-site')

    assert '--user' not in detected.argv


@pytest.mark.parametrize('installer', ['uv', 'conda', '', None])
def test_other_installers_are_unknown(tmp_path, installer):
    dist = make_dist(tmp_path / SITE, installer=installer)

    detected = detect(tmp_path, dist)

    assert detected.method == 'unknown'
    assert detected.argv == ()


def test_no_distribution_is_unknown(tmp_path):
    detected = detect(tmp_path, None, **EVERYTHING)

    assert detected.method == 'unknown'
    assert detected.argv == ()


def test_detect_install_defaults_to_the_module_seams(monkeypatch, tmp_path):
    dist = make_dist(tmp_path / SITE, installer='uv')
    prefix = tmp_path / 'prefix'
    prefix.mkdir()
    (prefix / 'pipx_metadata.json').write_text('')
    monkeypatch.setattr(updater, '_distribution', lambda name: dist)
    monkeypatch.setattr(updater, '_prefix', lambda: prefix)
    monkeypatch.setattr(updater, '_which', lambda command: '/bin/x')
    monkeypatch.setattr(updater, '_user_site', lambda: str(tmp_path))

    assert updater.detect_install().argv == PIPX_ARGV


def test_this_checkout_is_detected_as_a_source_checkout():
    # The dev and CI environments install the CLI editable (uv sync).
    detected = updater.detect_install()

    assert detected.method == 'editable'
    assert detected.argv == ()


# --- the default API base URL ---------------------------------------------


@pytest.mark.parametrize(
    ('url', 'expected'),
    [
        ('https://applika.dev/api', True),
        ('https://applika.dev/api/', True),
        ('HTTPS://Applika.DEV/api', True),
        ('http://applika.dev/api', False),
        ('https://applika.dev/API', False),
        ('https://applika.dev/api/v2', False),
        ('https://applika.dev', False),
        ('https://staging.applika.dev/api', False),
        ('https://applika.dev:443/api', False),
        ('http://127.0.0.1:8000/api', False),
        ('applika.dev/api', False),
        ('', False),
    ],
)
def test_is_default_api_base_url(url, expected):
    assert is_default_api_base_url(url) is expected


# --- gates ----------------------------------------------------------------


class Tty(io.StringIO):
    def isatty(self):
        return True


def ttys():
    return (Tty(), Tty(), Tty())


PIP_INSTALL = Install('pip', PIP_ARGV, '/site-packages')
DEFAULT_URL = 'https://applika.dev/api'
OTHER_URL = 'http://127.0.0.1:8000/api'


def make_config(url=DEFAULT_URL):
    return AppConfig(api_base_url=url, store=FakeStore())


def kinds(found):
    return [blocker.kind for blocker in found]


def gate(
    *,
    url=DEFAULT_URL,
    install=PIP_INSTALL,
    env=None,
    streams=None,
    auto=True,
    force=False,
):
    return updater.blockers(
        make_config(url),
        install,
        env or {},
        streams if streams is not None else ttys(),
        auto=auto,
        force=force,
    )


def test_no_gate_blocks_an_interactive_default_pip_install():
    assert gate() == []


@pytest.mark.parametrize('source', list(ApiBaseUrlSource))
def test_url_overridden_alone_carries_its_source(source):
    config = AppConfig(
        api_base_url=OTHER_URL, store=FakeStore(), api_base_url_source=source
    )

    found = updater.blockers(
        config, PIP_INSTALL, {}, ttys(), auto=True, force=False
    )

    assert found == [Blocker(BlockerKind.URL_OVERRIDDEN, OTHER_URL, source)]


def test_other_gates_carry_no_url_source():
    found = gate(
        url=OTHER_URL,
        install=Install('editable', (), '/src'),
        env={'APPLIKA_DISABLE_AUTOUPDATE': '1'},
    )

    assert [blocker.source for blocker in found] == [
        ApiBaseUrlSource.DEFAULT,
        None,
        None,
    ]


def test_ci_set_alone_is_not_interactive():
    assert kinds(gate(env={'CI': 'true'})) == [BlockerKind.NOT_INTERACTIVE]


def test_ci_set_to_empty_still_counts():
    assert kinds(gate(env={'CI': ''})) == [BlockerKind.NOT_INTERACTIVE]


@pytest.mark.parametrize('position', [0, 1, 2])
def test_one_stream_not_a_terminal_is_not_interactive(position):
    streams = list(ttys())
    streams[position] = io.StringIO()

    assert kinds(gate(streams=streams)) == [BlockerKind.NOT_INTERACTIVE]


class ClosedStream:
    def isatty(self):
        raise ValueError('I/O operation on closed file')


@pytest.mark.parametrize('stream', [None, object(), ClosedStream()])
def test_missing_or_closed_stream_is_not_a_terminal(stream):
    assert kinds(gate(streams=[Tty(), Tty(), stream])) == [
        BlockerKind.NOT_INTERACTIVE
    ]


def test_source_checkout_alone():
    found = gate(install=Install('editable', (), '/home/me/cli'))

    assert found == [Blocker(BlockerKind.SOURCE_CHECKOUT, '/home/me/cli')]


def test_unknown_method_alone():
    found = gate(install=Install('unknown', (), 'installer conda'))

    assert found == [Blocker(BlockerKind.UNKNOWN_METHOD, 'installer conda')]


@pytest.mark.parametrize(
    'value', ['1', 'yes', 'true', 'off', 'FALSE', 'False', ' 0 ', '   ']
)
def test_disable_env_blocks(value):
    found = gate(env={'APPLIKA_DISABLE_AUTOUPDATE': value})

    assert found == [Blocker(BlockerKind.DISABLED_BY_ENV, value)]


@pytest.mark.parametrize('value', ['', '0', 'false'])
def test_disable_env_off_values_do_not_block(value):
    assert gate(env={'APPLIKA_DISABLE_AUTOUPDATE': value}) == []


ALL_FIVE = {
    'url': OTHER_URL,
    'env': {'CI': '1', 'APPLIKA_DISABLE_AUTOUPDATE': '1'},
    'streams': (io.StringIO(), io.StringIO(), io.StringIO()),
}


def test_all_gates_in_order():
    editable = gate(install=Install('editable', (), '/src'), **ALL_FIVE)
    unknown = gate(install=Install('unknown', (), 'none'), **ALL_FIVE)

    # A checkout and an unknown method cannot both hold; each is checked.
    assert kinds(editable) == [
        BlockerKind.URL_OVERRIDDEN,
        BlockerKind.NOT_INTERACTIVE,
        BlockerKind.SOURCE_CHECKOUT,
        BlockerKind.DISABLED_BY_ENV,
    ]
    assert kinds(unknown) == [
        BlockerKind.URL_OVERRIDDEN,
        BlockerKind.NOT_INTERACTIVE,
        BlockerKind.UNKNOWN_METHOD,
        BlockerKind.DISABLED_BY_ENV,
    ]


def test_force_drops_the_env_gate_only():
    found = gate(
        install=Install('editable', (), '/src'), force=True, **ALL_FIVE
    )

    assert kinds(found) == [
        BlockerKind.URL_OVERRIDDEN,
        BlockerKind.NOT_INTERACTIVE,
        BlockerKind.SOURCE_CHECKOUT,
    ]


def test_force_alone_lifts_the_env_gate():
    assert gate(env={'APPLIKA_DISABLE_AUTOUPDATE': '1'}, force=True) == []


def test_manual_mode_has_no_terminal_gate():
    found = gate(
        env={'CI': 'true'},
        streams=(io.StringIO(), io.StringIO(), io.StringIO()),
        auto=False,
    )

    assert found == []


# --- install --------------------------------------------------------------


UV_INSTALL = Install('uv_tool', UV_ARGV, '/prefix/uv-receipt.toml')


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


def test_verify_runs_a_fresh_isolated_interpreter():
    assert updater.VERIFY_ARGV == (
        sys.executable,
        '-I',
        '-c',
        'import importlib.metadata as m; print(m.version("applika-cli"))',
    )


def test_install_ok_when_a_new_interpreter_reads_latest(monkeypatch):
    run = FakeRun(done(), done(stdout='1.2.0\n'))
    monkeypatch.setattr(updater, '_run', run)

    result = updater.install(UV_INSTALL, '1.2.0')

    assert result == InstallResult(ok=True, code=0, new_version='1.2.0')
    assert [argv for argv, _ in run.calls] == [UV_ARGV, updater.VERIFY_ARGV]
    assert run.calls[0][1] == 120
    assert 0 < run.calls[1][1] <= 120


PIP_USER_INSTALL = Install(
    'pip',
    (*PIP_ARGV[:-1], '--user', 'applika-cli'),
    '/home/me/.local/lib/site-packages',
)


def test_pip_user_verify_reads_the_user_site(monkeypatch):
    monkeypatch.setattr(updater, '_user_site', lambda: '/home/me/.local/site')
    run = FakeRun(done(), done(stdout='1.2.0'))
    monkeypatch.setattr(updater, '_run', run)

    assert updater.install(PIP_USER_INSTALL, '1.2.0').ok is True

    assert run.calls[1][0] == (
        sys.executable,
        '-I',
        '-c',
        updater.VERIFY_USER_SITE_CODE,
        '/home/me/.local/site',
    )


def test_pip_user_verify_finds_the_user_site_copy_first(monkeypatch, tmp_path):
    # A real interpreter, no installer: -I alone hides the user site, so
    # it would read this venv's 1.1.0, not the --user 9.9.9.
    user_site = tmp_path / 'user-site'
    make_dist(user_site, installer='pip')
    metadata = user_site / 'applika_cli-1.1.0.dist-info' / 'METADATA'
    metadata.write_text(
        'Metadata-Version: 2.1\nName: applika-cli\nVersion: 9.9.9\n'
    )
    monkeypatch.setattr(updater, '_user_site', lambda: str(user_site))

    def read(argv):
        return subprocess.run(
            list(argv), capture_output=True, text=True, check=True
        ).stdout.strip()

    assert read(updater._verify_argv(PIP_USER_INSTALL)) == '9.9.9'
    assert read(updater.VERIFY_ARGV) != '9.9.9'


@pytest.mark.parametrize('install', [UV_INSTALL, PIP_INSTALL])
def test_other_installs_verify_without_the_user_site(install):
    assert updater._verify_argv(install) == updater.VERIFY_ARGV


def test_install_accepts_a_padded_equal_release(monkeypatch):
    monkeypatch.setattr(updater, '_run', FakeRun(done(), done(stdout='1.2')))

    assert updater.install(UV_INSTALL, '1.2.0').ok is True


def test_install_failure_keeps_the_last_20_stderr_lines(monkeypatch):
    stderr = '\n'.join(f'line {n}' for n in range(1, 31))
    run = FakeRun(done(code=2, stderr=stderr))
    monkeypatch.setattr(updater, '_run', run)

    result = updater.install(UV_INSTALL, '1.2.0', timeout=5)

    assert result.ok is False
    assert result.code == 2
    assert result.stderr_tail.splitlines() == [
        f'line {n}' for n in range(11, 31)
    ]
    assert len(run.calls) == 1  # no verify after a failed install
    assert run.calls[0][1] == 5


def test_install_timeout(monkeypatch):
    run = FakeRun(subprocess.TimeoutExpired(UV_ARGV, 120))
    monkeypatch.setattr(updater, '_run', run)

    result = updater.install(UV_INSTALL, '1.2.0')

    assert result.ok is False
    assert result.timed_out is True
    assert len(run.calls) == 1


def test_verify_timeout_is_a_timeout(monkeypatch):
    run = FakeRun(done(), subprocess.TimeoutExpired(updater.VERIFY_ARGV, 1))
    monkeypatch.setattr(updater, '_run', run)

    result = updater.install(UV_INSTALL, '1.2.0')

    assert result.ok is False
    assert result.timed_out is True


def test_no_time_left_for_the_verify_is_a_timeout(monkeypatch):
    clock = iter([0.0, 121.0])
    monkeypatch.setattr(updater.time, 'monotonic', lambda: next(clock))
    run = FakeRun(done())
    monkeypatch.setattr(updater, '_run', run)

    result = updater.install(UV_INSTALL, '1.2.0', timeout=120)

    assert result.timed_out is True
    assert len(run.calls) == 1


def test_verify_gets_the_rest_of_the_budget(monkeypatch):
    clock = iter([0.0, 100.0])
    monkeypatch.setattr(updater.time, 'monotonic', lambda: next(clock))
    run = FakeRun(done(), done(stdout='1.2.0'))
    monkeypatch.setattr(updater, '_run', run)

    updater.install(UV_INSTALL, '1.2.0', timeout=120)

    assert run.calls[1][1] == 20


def test_install_kept_when_another_version_stays(monkeypatch):
    # A pin (uv tool / pipx constraint) keeps the old version.
    monkeypatch.setattr(updater, '_run', FakeRun(done(), done(stdout='1.1.0')))

    result = updater.install(UV_INSTALL, '1.2.0')

    assert result.ok is False
    assert result.kept is True
    assert result.new_version == '1.1.0'


def test_failed_verify_is_not_ok(monkeypatch):
    run = FakeRun(done(), done(code=1, stderr='PackageNotFoundError'))
    monkeypatch.setattr(updater, '_run', run)

    result = updater.install(UV_INSTALL, '1.2.0')

    assert result.ok is False
    assert result.kept is False
    assert result.stderr_tail == 'PackageNotFoundError'


def test_install_lets_ctrl_c_propagate(monkeypatch):
    monkeypatch.setattr(updater, '_run', FakeRun(KeyboardInterrupt()))

    with pytest.raises(KeyboardInterrupt):
        updater.install(UV_INSTALL, '1.2.0')


@pytest.mark.parametrize('method', ['editable', 'unknown'])
def test_install_refuses_a_method_without_an_installer(monkeypatch, method):
    with pytest.raises(ValueError, match=method):
        updater.install(Install(method, (), None), '1.2.0')


# --- the auto update ------------------------------------------------------


class Pypi:
    """A PyPI that answers ``latest`` (or ``status``) and records requests."""

    def __init__(self, latest='1.2.0', status=200, error=None):
        self.latest = latest
        self.status = status
        self.error = error
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return httpx.Response(
            self.status, json={'info': {'version': self.latest}}
        )


def ready(
    monkeypatch,
    *,
    latest='1.2.0',
    installed='1.1.0',
    run=None,
    install=UV_INSTALL,
    env=None,
    now=NOW,
):
    """Everything open: interactive, default URL, a uv tool install, due."""
    pypi = Pypi(latest)
    use_pypi(monkeypatch, pypi)
    run = run or FakeRun(done(), done(stdout=f'{latest}\n'))
    monkeypatch.setattr(updater, '_run', run)
    monkeypatch.setattr(updater, '_env', lambda: dict(env or {}))
    monkeypatch.setattr(updater, '_streams', ttys)
    monkeypatch.setattr(updater, '_now', lambda: now)
    monkeypatch.setattr(updater, 'detect_install', lambda: install)
    monkeypatch.setattr(updater, 'installed_version', lambda: installed)
    return pypi, run


def test_after_command_installs_a_newer_release(monkeypatch, capsys):
    pypi, run = ready(monkeypatch)

    assert updater.after_command(make_config()) is None

    captured = capsys.readouterr()
    assert captured.out == ''
    assert captured.err == 'Updated applika-cli 1.1.0 → 1.2.0\n'
    assert [str(r.url) for r in pypi.requests] == [updater.PYPI_JSON_URL]
    assert pypi.requests[0].extensions['timeout']['read'] == 3
    assert pypi.requests[0].extensions['timeout']['connect'] == 3
    assert run.calls[0] == (UV_ARGV, 120)
    assert UpdateState.load() == UpdateState(NOW, '1.2.0')
    assert not lock_file().exists()


@pytest.mark.parametrize(
    ('install', 'argv'),
    [
        (Install('pipx', PIPX_ARGV), PIPX_ARGV),
        (Install('pip', PIP_ARGV), PIP_ARGV),
    ],
)
def test_after_command_uses_the_detected_tool(monkeypatch, install, argv):
    _, run = ready(monkeypatch, install=install)

    updater.after_command(make_config())

    assert run.calls[0][0] == argv


def test_the_clock_seam_is_utc_aware():
    before = datetime.now(timezone.utc)

    now = updater._now()

    assert now.utcoffset() == timedelta(0)
    assert before <= now <= datetime.now(timezone.utc)


@pytest.mark.parametrize(
    ('change', 'value'),
    [
        ('url', OTHER_URL),
        ('env', {'CI': 'true'}),
        ('streams', None),
        ('install', Install('editable', (), '/src')),
        ('install', Install('unknown', (), 'none')),
        ('env', {'APPLIKA_DISABLE_AUTOUPDATE': '1'}),
    ],
)
def test_each_gate_stops_the_auto_update(monkeypatch, capsys, change, value):
    pypi, run = ready(
        monkeypatch,
        env=value if change == 'env' else None,
        install=value if change == 'install' else UV_INSTALL,
    )
    if change == 'streams':
        monkeypatch.setattr(updater, '_streams', lambda: (Tty(), Tty(), None))

    updater.after_command(
        make_config(value if change == 'url' else DEFAULT_URL)
    )

    assert pypi.requests == []
    assert run.calls == []
    assert not state_file().exists()
    assert capsys.readouterr().err == ''


def test_not_due_does_not_check(monkeypatch):
    pypi, run = ready(monkeypatch)
    UpdateState(NOW - timedelta(hours=23), '1.2.0').save()

    updater.after_command(make_config())

    assert pypi.requests == []
    assert run.calls == []
    assert UpdateState.load() == UpdateState(NOW - timedelta(hours=23), '1.2.0')


def test_a_future_check_time_is_due(monkeypatch):
    pypi, _ = ready(monkeypatch)
    UpdateState(NOW + timedelta(hours=5), '1.1.0').save()

    updater.after_command(make_config())

    assert len(pypi.requests) == 1
    assert UpdateState.load().checked_at == NOW


def test_lock_held_by_another_process_skips(monkeypatch):
    pypi, run = ready(monkeypatch)
    lock_file().parent.mkdir(parents=True)
    lock_file().write_text('')

    updater.after_command(make_config())

    assert pypi.requests == []
    assert run.calls == []
    assert lock_file().exists()  # not ours to remove
    assert not state_file().exists()


def test_a_check_done_while_waiting_for_the_lock_is_honoured(monkeypatch):
    pypi, _ = ready(monkeypatch)
    real_lock = updater.update_lock

    @contextmanager
    def lock_after_another_check():
        # Another process checked between our first read and the lock.
        UpdateState(NOW - timedelta(minutes=1), '1.2.0').save()
        with real_lock() as acquired:
            yield acquired

    monkeypatch.setattr(updater, 'update_lock', lock_after_another_check)

    updater.after_command(make_config())

    assert pypi.requests == []


def test_a_check_started_a_moment_later_elsewhere_is_honoured(monkeypatch):
    # The other process's start is later than our first clock read: the
    # clock is read again once the lock is held, so it is not "future".
    pypi, _ = ready(monkeypatch)
    clock = iter([NOW, NOW + timedelta(seconds=2)])
    monkeypatch.setattr(updater, '_now', lambda: next(clock))
    real_lock = updater.update_lock

    @contextmanager
    def lock_after_another_check():
        UpdateState(NOW + timedelta(seconds=1), '1.2.0').save()
        with real_lock() as acquired:
            yield acquired

    monkeypatch.setattr(updater, 'update_lock', lock_after_another_check)

    updater.after_command(make_config())

    assert pypi.requests == []
    assert UpdateState.load().checked_at == NOW + timedelta(seconds=1)


def test_the_saved_check_time_is_read_after_the_lock(monkeypatch):
    pypi, _ = ready(monkeypatch)
    clock = iter([NOW, NOW + timedelta(seconds=2)])
    monkeypatch.setattr(updater, '_now', lambda: next(clock))

    updater.after_command(make_config())

    assert len(pypi.requests) == 1
    assert UpdateState.load().checked_at == NOW + timedelta(seconds=2)


def test_failed_check_is_silent_and_waits_a_day(monkeypatch, capsys):
    pypi, run = ready(monkeypatch)
    pypi.status = 503

    updater.after_command(make_config())

    assert UpdateState.load() == UpdateState(NOW, None)
    assert run.calls == []
    assert capsys.readouterr() == ('', '')

    # Same day: not retried. A day later: checked again.
    monkeypatch.setattr(updater, '_now', lambda: NOW + timedelta(hours=23))
    updater.after_command(make_config())
    assert len(pypi.requests) == 1

    monkeypatch.setattr(updater, '_now', lambda: NOW + timedelta(hours=24))
    updater.after_command(make_config())
    assert len(pypi.requests) == 2


def test_checked_at_is_saved_before_the_network_call(monkeypatch):
    pypi, _ = ready(monkeypatch)
    seen = []

    def handler(request):
        seen.append(UpdateState.load())
        return pypi(request)

    use_pypi(monkeypatch, handler)

    updater.after_command(make_config())

    assert seen == [UpdateState(NOW, None)]


def test_connection_error_is_silent(monkeypatch, capsys):
    pypi, run = ready(monkeypatch)
    pypi.error = httpx.ConnectError('offline')

    updater.after_command(make_config())

    assert UpdateState.load() == UpdateState(NOW, None)
    assert run.calls == []
    assert capsys.readouterr() == ('', '')


@pytest.mark.parametrize('latest', ['1.1.0', '1.0.9', '1.2.0rc1'])
def test_not_newer_or_not_comparable_installs_nothing(
    monkeypatch, capsys, latest
):
    _, run = ready(monkeypatch, latest=latest)

    updater.after_command(make_config())

    assert run.calls == []
    assert UpdateState.load() == UpdateState(NOW, latest)
    assert capsys.readouterr() == ('', '')


def test_unknown_installed_version_installs_nothing(monkeypatch):
    _, run = ready(monkeypatch, installed='unknown')

    updater.after_command(make_config())

    assert run.calls == []


@pytest.mark.parametrize(
    'answers',
    [
        (done(code=1, stderr='no network'),),
        (subprocess.TimeoutExpired(UV_ARGV, 120),),
        (done(), done(stdout='1.1.0')),
        (KeyboardInterrupt(),),
        (done(), KeyboardInterrupt()),
        (RuntimeError('spawn failed'),),
    ],
    ids=['fails', 'times-out', 'kept', 'ctrl-c', 'ctrl-c-verify', 'error'],
)
def test_install_problems_are_silent(monkeypatch, capsys, answers):
    ready(monkeypatch, run=FakeRun(*answers))

    assert updater.after_command(make_config()) is None

    assert capsys.readouterr() == ('', '')
    assert UpdateState.load() == UpdateState(NOW, '1.2.0')
    assert not lock_file().exists()


def test_ctrl_c_during_the_check_is_silent(monkeypatch, capsys):
    pypi, run = ready(monkeypatch)
    pypi.error = KeyboardInterrupt()

    updater.after_command(make_config())

    assert run.calls == []
    assert capsys.readouterr() == ('', '')
    assert not lock_file().exists()


def test_arrow_falls_back_when_stderr_cannot_encode_it():
    ascii_stream = io.TextIOWrapper(io.BytesIO(), encoding='ascii')
    utf8_stream = io.TextIOWrapper(io.BytesIO(), encoding='utf-8')

    assert updater._arrow(ascii_stream) == '->'
    assert updater._arrow(utf8_stream) == '→'
    assert updater._arrow(object()) == '->'


def test_announcement_uses_ascii_on_an_ascii_stderr(monkeypatch):
    ready(monkeypatch)
    buffer = io.BytesIO()
    stderr = io.TextIOWrapper(buffer, encoding='ascii')
    monkeypatch.setattr(sys, 'stderr', stderr)

    updater.after_command(make_config())

    stderr.flush()
    assert buffer.getvalue() == b'Updated applika-cli 1.1.0 -> 1.2.0\n'


def test_updater_never_imports_the_api_client():
    code = (
        'import sys, applika.lib.updater; '
        "print('applika.lib.api' in sys.modules)"
    )
    result = subprocess.run(
        [sys.executable, '-c', code],
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.strip() == 'False'


# --- through the CLI ------------------------------------------------------


@pytest.fixture
def probe_commands():
    """Three throwaway commands on the real app: exit 0, exit 1, a crash."""

    def probe_ok():
        typer.echo('probe output')

    def probe_fail():
        typer.echo('probe output')
        typer.echo('probe failed', err=True)
        raise typer.Exit(1)

    def probe_crash():
        raise RuntimeError('boom')

    before = list(cli_app.app.registered_commands)
    cli_app.app.command('probe-ok')(probe_ok)
    cli_app.app.command('probe-fail')(probe_fail)
    cli_app.app.command('probe-crash')(probe_crash)
    yield
    cli_app.app.registered_commands[:] = before


def signed_in_store(url=DEFAULT_URL):
    session = make_session()
    session.api_base_url = url
    return FakeStore(session)


def use_store(monkeypatch, store):
    monkeypatch.setattr(cli_app, 'SessionStore', lambda: store)
    monkeypatch.delenv('APPLIKA_API_BASE_URL', raising=False)


def invoke(runner, args, **kwargs):
    return runner.invoke(cli_app.app, args, **kwargs)


@pytest.mark.parametrize(
    ('command', 'code', 'stdout'),
    [
        ('probe-ok', 0, 'probe output\n'),
        ('probe-fail', 1, 'probe output\n'),
    ],
)
def test_update_runs_after_the_command_and_keeps_its_result(
    monkeypatch, runner, probe_commands, command, code, stdout
):
    use_store(monkeypatch, signed_in_store())
    pypi, run = ready(monkeypatch)

    result = invoke(runner, [command])

    assert result.exit_code == code
    assert result.stdout == stdout
    assert result.stderr.endswith('Updated applika-cli 1.1.0 → 1.2.0\n')
    assert run.calls[0] == (UV_ARGV, 120)
    assert [str(r.url) for r in pypi.requests] == [updater.PYPI_JSON_URL]


def test_update_runs_after_a_crash_and_keeps_the_crash(
    monkeypatch, runner, probe_commands
):
    use_store(monkeypatch, signed_in_store())
    _, run = ready(monkeypatch)

    result = invoke(runner, ['probe-crash'])

    assert result.exit_code == 1
    assert isinstance(result.exception, RuntimeError)
    assert len(run.calls) == 2


@pytest.mark.parametrize('command', ['probe-ok', 'probe-fail'])
@pytest.mark.parametrize(
    'answers',
    [
        (done(code=1, stderr='denied'),),
        (subprocess.TimeoutExpired(UV_ARGV, 120),),
        (done(), done(stdout='1.1.0')),
        (KeyboardInterrupt(),),
    ],
    ids=['fails', 'times-out', 'kept', 'ctrl-c'],
)
def test_install_problems_leave_the_command_untouched(
    monkeypatch, runner, probe_commands, command, answers
):
    use_store(monkeypatch, signed_in_store())
    baseline = invoke(runner, [command])  # default seams: not interactive
    ready(monkeypatch, run=FakeRun(*answers))

    result = invoke(runner, [command])

    assert result.exit_code == baseline.exit_code
    assert result.stdout == baseline.stdout
    assert result.stderr == baseline.stderr
    assert type(result.exception) is type(baseline.exception)
    assert UpdateState.load().latest_version == '1.2.0'  # it did run


def test_signed_out_command_still_updates(monkeypatch, runner):
    use_store(monkeypatch, FakeStore(None))
    pypi, run = ready(monkeypatch)

    result = invoke(runner, ['whoami'])

    assert result.exit_code == 1  # "Please run `applika login` first."
    assert 'Updated applika-cli 1.1.0 → 1.2.0' in result.stderr
    assert len(run.calls) == 2
    # Only PyPI was asked: no Applika API request.
    assert [r.url.host for r in pypi.requests] == ['pypi.org']


@pytest.mark.parametrize(
    'how', ['flag', 'env', 'session'], ids=['flag', 'env', 'session']
)
def test_overridden_url_from_any_source_skips(
    monkeypatch, runner, probe_commands, how
):
    use_store(
        monkeypatch,
        signed_in_store(OTHER_URL if how == 'session' else DEFAULT_URL),
    )
    pypi, run = ready(monkeypatch)
    args = ['probe-ok']
    env = None
    if how == 'flag':
        args = ['--api-base-url', OTHER_URL, *args]
    elif how == 'env':
        env = {'APPLIKA_API_BASE_URL': OTHER_URL}

    result = invoke(runner, args, env=env)

    assert result.exit_code == 0
    assert result.stdout == 'probe output\n'
    assert result.stderr == ''
    assert pypi.requests == []
    assert run.calls == []
    assert not state_file().exists()


def test_default_url_with_a_trailing_slash_from_the_flag_updates(
    monkeypatch, runner, probe_commands
):
    use_store(monkeypatch, FakeStore(None))
    _, run = ready(monkeypatch)

    invoke(runner, ['--api-base-url', 'https://applika.dev/api/', 'probe-ok'])

    assert len(run.calls) == 2


def test_cli_runner_without_patched_seams_never_checks(
    monkeypatch, runner, probe_commands
):
    # CliRunner streams are not terminals: every command test stops here.
    use_store(monkeypatch, signed_in_store())
    monkeypatch.setattr(updater, '_now', lambda: NOW)

    result = invoke(runner, ['probe-ok'])

    assert result.exit_code == 0
    assert not state_file().exists()


def test_after_command_gets_the_resolved_config(
    monkeypatch, runner, probe_commands
):
    use_store(monkeypatch, FakeStore(None))
    seen = []
    monkeypatch.setattr(updater, 'after_command', seen.append)

    invoke(runner, ['--api-base-url', 'https://x.test/api/', 'probe-ok'])

    assert [config.api_base_url for config in seen] == ['https://x.test/api']


@pytest.mark.parametrize('args', [['--version'], ['-v'], []])
def test_version_flag_and_bare_applika_never_update(monkeypatch, runner, args):
    seen = []
    monkeypatch.setattr(updater, 'after_command', seen.append)

    result = invoke(runner, args)

    assert result.exit_code == 0
    assert seen == []
