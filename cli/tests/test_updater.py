import json
import os
import stat
import subprocess
import sys
from contextlib import suppress
from datetime import datetime, timedelta, timezone

import httpx
import pytest

import applika.commands.version as version_module
from applika.lib import updater
from applika.lib.updater import UpdateState
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
