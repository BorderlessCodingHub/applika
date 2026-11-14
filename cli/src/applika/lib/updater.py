"""What the daily auto update and ``applika update`` share: the PyPI read,
the version compare, the ``update.json`` record and the ``update.lock``.

This module never imports ``applika.commands`` (``commands/version.py``
imports from here)."""

import json
import os
import re
import shutil
import site
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from importlib.metadata import Distribution, PackageNotFoundError
from importlib.metadata import distribution as package_distribution
from importlib.metadata import version as package_version
from pathlib import Path
from typing import IO, Any
from urllib.parse import unquote, urlsplit
from urllib.request import url2pathname

import httpx

from applika.config import (
    ApiBaseUrlSource,
    AppConfig,
    is_default_api_base_url,
)

PACKAGE_NAME = 'applika-cli'
PYPI_JSON_URL = f'https://pypi.org/pypi/{PACKAGE_NAME}/json'

STATE_FILE_NAME = 'update.json'
LOCK_FILE_NAME = 'update.lock'
CHECK_INTERVAL = timedelta(hours=24)
LOCK_STALE_SECONDS = 600
CHECK_TIMEOUT_SECONDS = 3.0
INSTALL_TIMEOUT_SECONDS = 120.0
STDERR_TAIL_LINES = 20

DISABLE_ENV_VAR = 'APPLIKA_DISABLE_AUTOUPDATE'
CI_ENV_VAR = 'CI'
# Values of APPLIKA_DISABLE_AUTOUPDATE that leave the update on.
_ENV_OFF_VALUES = frozenset({'', '0', 'false'})

# Reads the installed version in a new interpreter: this process still
# holds the metadata it imported before the installer replaced it.
VERIFY_ARGV = (
    sys.executable,
    '-I',
    '-c',
    'import importlib.metadata as m; print(m.version("applika-cli"))',
)
# ``-I`` leaves the user site out, so a ``pip --user`` verify puts it back,
# ahead of the rest as a normal interpreter would. The path comes from this
# process (``site.getusersitepackages()``), never from PyPI.
VERIFY_USER_SITE_CODE = (
    'import sys, importlib.metadata as m; sys.path.insert(0, sys.argv[1]); '
    'print(m.version("applika-cli"))'
)

_RELEASE_PATTERN = re.compile(r'\d+(\.\d+)*')

# Tests swap this for an ``httpx.MockTransport``; ``None`` = the network.
_transport: httpx.BaseTransport | None = None


def installed_version() -> str:
    try:
        return package_version(PACKAGE_NAME)
    except PackageNotFoundError:
        return 'unknown'


def fetch_latest(timeout: float) -> str:
    """Return the latest version PyPI publishes. Raises on an HTTP error,
    a body that is not JSON, or a body without ``info.version``: the
    caller decides what a failed read means."""
    with httpx.Client(transport=_transport, timeout=timeout) as client:
        response = client.get(PYPI_JSON_URL)
        response.raise_for_status()
        body = response.json()
    info = body.get('info') if isinstance(body, dict) else None
    if not isinstance(info, dict):
        raise ValueError(f'PyPI body has no info object: {body!r:.80}')
    latest = info['version']
    if not isinstance(latest, str):
        raise ValueError(f'PyPI info.version is not a string: {latest!r}')
    return latest


def parse_release(value: object) -> tuple[int, ...] | None:
    """``'1.2.3'`` -> ``(1, 2, 3)``. Anything but dot-separated numbers
    (``'1.2.0rc1'``, ``'unknown'``) -> ``None``."""
    if not isinstance(value, str) or not _RELEASE_PATTERN.fullmatch(value):
        return None
    return tuple(int(part) for part in value.split('.'))


def is_newer(latest: str, installed: str) -> bool | None:
    """True when ``latest`` is a later release than ``installed``; ``None``
    when either does not parse. Missing parts count as zero, so ``1.2``
    equals ``1.2.0``."""
    latest_parts = parse_release(latest)
    installed_parts = parse_release(installed)
    if latest_parts is None or installed_parts is None:
        return None
    width = max(len(latest_parts), len(installed_parts))
    latest_parts += (0,) * (width - len(latest_parts))
    installed_parts += (0,) * (width - len(installed_parts))
    return latest_parts > installed_parts


def _run(
    argv: Sequence[str], timeout: float
) -> subprocess.CompletedProcess[str]:
    """Run an installer command, no shell. Tests swap it for a refuser."""
    return subprocess.run(
        list(argv),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _state_dir() -> Path:
    """The CLI's config folder, where ``session.json`` lives. Tests point
    it at a temporary folder."""
    return Path.home() / '.config' / 'applika'


def _parse_checked_at(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed


@dataclass
class UpdateState:
    """``update.json``: when the last check started and what it found.
    ``checked_at`` ``None`` = never checked."""

    checked_at: datetime | None = None
    latest_version: str | None = None

    @staticmethod
    def path() -> Path:
        return _state_dir() / STATE_FILE_NAME

    @classmethod
    def load(cls) -> 'UpdateState':
        """A missing, unreadable or damaged record reads as never checked."""
        try:
            data = json.loads(cls.path().read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return cls()
        if not isinstance(data, dict):
            return cls()
        checked_at = _parse_checked_at(data.get('checked_at'))
        latest_version = data.get('latest_version')
        if checked_at is None or not (
            latest_version is None or isinstance(latest_version, str)
        ):
            return cls()
        return cls(checked_at=checked_at, latest_version=latest_version)

    def save(self) -> None:
        """Write the record atomically (temp file + replace), mode 0o644."""
        if self.checked_at is None:
            raise ValueError('checked_at is required to save the record')
        path = self.path()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {
                'checked_at': self.checked_at.astimezone(
                    timezone.utc
                ).isoformat(),
                'latest_version': self.latest_version,
            },
            indent=2,
            sort_keys=True,
        )
        fd, tmp_path = tempfile.mkstemp(
            dir=path.parent,
            prefix=f'{path.name}.',
        )
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as file:
                file.write(payload)
            os.chmod(tmp_path, 0o644)
            os.replace(tmp_path, path)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def due(self, now: datetime) -> bool:
        """Never checked, the last check started 24 h ago or more, or it
        started in the future (clock moved back, edited record): a start
        that has not happened yet counts as never checked."""
        if self.checked_at is None or self.checked_at > now:
            return True
        return now - self.checked_at >= CHECK_INTERVAL


def _try_create(path: Path) -> bool:
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        return False
    os.close(fd)
    return True


def _acquire(path: Path, now: Callable[[], float]) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if _try_create(path):
        return True
    try:
        age = now() - path.stat().st_mtime
    except FileNotFoundError:
        age = None  # released between the two calls: try once more
    if age is not None and age <= LOCK_STALE_SECONDS:
        return False
    with suppress(FileNotFoundError):
        path.unlink()
    return _try_create(path)


@contextmanager
def update_lock(now: Callable[[], float] = time.time) -> Iterator[bool]:
    """Hold ``update.lock`` for the block. Yields ``True`` when this process
    holds it, ``False`` when another one does (the caller skips). A lock
    older than 600 s is stale: it is removed and taken once more."""
    path = _state_dir() / LOCK_FILE_NAME
    acquired = _acquire(path, now)
    try:
        yield acquired
    finally:
        if acquired:
            with suppress(FileNotFoundError):
                path.unlink()


# --- install detection ----------------------------------------------------

EDITABLE = 'editable'
UV_TOOL = 'uv_tool'
PIPX = 'pipx'
PIP = 'pip'
UNKNOWN = 'unknown'


@dataclass(frozen=True)
class Install:
    """How applika-cli was installed. ``argv`` upgrades it (empty for
    ``editable`` and ``unknown``); ``detail`` says why (a path, a marker
    file, or the reason the method is unknown)."""

    method: str
    argv: tuple[str, ...] = ()
    detail: str | None = None


def _distribution(name: str) -> Distribution:
    return package_distribution(name)


def _prefix() -> Path:
    return Path(sys.prefix)


def _which(command: str) -> str | None:
    return shutil.which(command)


def _user_site() -> str:
    return site.getusersitepackages()


def _file_url_path(url: str) -> str:
    return url2pathname(unquote(urlsplit(url).path))


def _source_checkout(dist: Distribution) -> str | None:
    """The checkout path when PEP 610 ``direct_url.json`` says editable or
    points at a local ``file:`` URL (``uv tool install --force .``)."""
    try:
        raw = dist.read_text('direct_url.json')
    except OSError:
        return None
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    url = data.get('url')
    url = url if isinstance(url, str) else ''
    dir_info = data.get('dir_info')
    editable = isinstance(dir_info, dict) and dir_info.get('editable') is True
    if editable or url.lower().startswith('file:'):
        return _file_url_path(url) if url else '(editable install)'
    return None


def _installer(dist: Distribution) -> str:
    try:
        raw = dist.read_text('INSTALLER')
    except OSError:
        return ''
    return (raw or '').strip()


def _under(path: Path, parent: str) -> bool:
    try:
        return path.resolve().is_relative_to(Path(parent).resolve())
    except (OSError, ValueError):
        return False


def detect_install(
    *,
    distribution: Callable[[str], Distribution] | None = None,
    prefix: Callable[[], Path] | None = None,
    which: Callable[[str], str | None] | None = None,
    user_site: Callable[[], str] | None = None,
) -> Install:
    """Detect the install method (ADR-0023 order): a source checkout, a
    ``uv tool``, a ``pipx`` venv, ``pip``, else unknown. A marker whose tool
    is not on the PATH is unknown. The argv are fixed lists: nothing read
    from PyPI ever enters them."""
    distribution = distribution or _distribution
    prefix = prefix or _prefix
    which = which or _which
    user_site = user_site or _user_site
    try:
        dist = distribution(PACKAGE_NAME)
    except PackageNotFoundError:
        return Install(UNKNOWN, detail=f'{PACKAGE_NAME} is not installed')
    checkout = _source_checkout(dist)
    if checkout is not None:
        return Install(EDITABLE, detail=checkout)
    root = prefix()
    receipt = root / 'uv-receipt.toml'
    if receipt.is_file():
        if which('uv') is None:
            return Install(UNKNOWN, detail=f'{receipt} found, uv not on PATH')
        return Install(
            UV_TOOL, ('uv', 'tool', 'upgrade', PACKAGE_NAME), str(receipt)
        )
    pipx_metadata = root / 'pipx_metadata.json'
    if pipx_metadata.is_file():
        if which('pipx') is None:
            return Install(
                UNKNOWN, detail=f'{pipx_metadata} found, pipx not on PATH'
            )
        return Install(
            PIPX, ('pipx', 'upgrade', PACKAGE_NAME), str(pipx_metadata)
        )
    installer = _installer(dist)
    if installer == 'pip':
        location = Path(str(dist.locate_file('')))
        argv = (sys.executable, '-m', 'pip', 'install', '--upgrade')
        if _under(location, user_site()):
            argv += ('--user',)
        return Install(PIP, (*argv, PACKAGE_NAME), str(location))
    return Install(
        UNKNOWN, detail=f'installer {installer or "(none)"} is not supported'
    )


# --- gates ----------------------------------------------------------------


class BlockerKind(str, Enum):
    URL_OVERRIDDEN = 'url_overridden'
    NOT_INTERACTIVE = 'not_interactive'
    SOURCE_CHECKOUT = 'source_checkout'
    UNKNOWN_METHOD = 'unknown_method'
    DISABLED_BY_ENV = 'disabled_by_env'


@dataclass(frozen=True)
class Blocker:
    """One gate that stops the update, with what tripped it (the URL, the
    checkout path, the env value). ``source`` says where an overridden URL
    comes from; ``None`` for every other gate."""

    kind: BlockerKind
    detail: str | None = None
    source: ApiBaseUrlSource | None = None


def _env() -> Mapping[str, str]:
    return os.environ


def _streams() -> tuple[Any, Any, Any]:
    """stdin, stdout, stderr as they are now (CliRunner swaps them)."""
    return sys.stdin, sys.stdout, sys.stderr


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_tty(stream: object) -> bool:
    isatty = getattr(stream, 'isatty', None)
    if isatty is None:
        return False
    try:
        return bool(isatty())
    except (OSError, ValueError):  # closed or detached stream
        return False


def _disabled_by_env(env: Mapping[str, str]) -> str | None:
    value = env.get(DISABLE_ENV_VAR)
    if value is None or value in _ENV_OFF_VALUES:
        return None
    return value


def blockers(
    config: AppConfig,
    install: Install,
    env: Mapping[str, str],
    streams: Sequence[object],
    *,
    auto: bool,
    force: bool,
) -> list[Blocker]:
    """Every gate that stops the update, in ADR-0023 order. The terminal
    gate applies to the auto update only; ``force`` lifts the env gate
    only."""
    found: list[Blocker] = []
    if not is_default_api_base_url(config.api_base_url):
        found.append(
            Blocker(
                BlockerKind.URL_OVERRIDDEN,
                config.api_base_url,
                config.api_base_url_source,
            )
        )
    if auto:
        if CI_ENV_VAR in env:
            found.append(
                Blocker(BlockerKind.NOT_INTERACTIVE, f'{CI_ENV_VAR} is set')
            )
        elif not all(_is_tty(stream) for stream in streams):
            found.append(Blocker(BlockerKind.NOT_INTERACTIVE, 'not a terminal'))
    if install.method == EDITABLE:
        found.append(Blocker(BlockerKind.SOURCE_CHECKOUT, install.detail))
    elif install.method == UNKNOWN:
        found.append(Blocker(BlockerKind.UNKNOWN_METHOD, install.detail))
    disabled = None if force else _disabled_by_env(env)
    if disabled is not None:
        found.append(Blocker(BlockerKind.DISABLED_BY_ENV, disabled))
    return found


# --- install --------------------------------------------------------------


@dataclass(frozen=True)
class InstallResult:
    """``ok``: the installer exited 0 and a new interpreter reads ``latest``.
    ``kept``: it exited 0 but another version stayed (a pin)."""

    ok: bool
    code: int | None = None
    stderr_tail: str = ''
    kept: bool = False
    timed_out: bool = False
    new_version: str | None = None


def _tail(text: str | None) -> str:
    lines = (text or '').splitlines()
    return '\n'.join(lines[-STDERR_TAIL_LINES:])


def _same_release(left: str, right: str) -> bool:
    if left == right:
        return True
    return is_newer(left, right) is False and is_newer(right, left) is False


def _verify_argv(install: Install) -> tuple[str, ...]:
    if '--user' in install.argv:
        return (sys.executable, '-I', '-c', VERIFY_USER_SITE_CODE, _user_site())
    return VERIFY_ARGV


def install(
    install: Install,
    latest: str,
    timeout: float = INSTALL_TIMEOUT_SECONDS,
) -> InstallResult:
    """Run the installer, then read the version in a new interpreter. The
    whole run, verify included, stays inside ``timeout``. A
    ``KeyboardInterrupt`` propagates (``subprocess.run`` kills the child);
    the caller decides what it means."""
    if not install.argv:
        raise ValueError(f'no installer for method {install.method!r}')
    deadline = time.monotonic() + timeout
    try:
        completed = _run(install.argv, timeout)
    except subprocess.TimeoutExpired:
        return InstallResult(ok=False, timed_out=True)
    if completed.returncode != 0:
        return InstallResult(
            ok=False,
            code=completed.returncode,
            stderr_tail=_tail(completed.stderr),
        )
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return InstallResult(ok=False, code=0, timed_out=True)
    try:
        verified = _run(_verify_argv(install), remaining)
    except subprocess.TimeoutExpired:
        return InstallResult(ok=False, code=0, timed_out=True)
    if verified.returncode != 0:
        return InstallResult(
            ok=False, code=0, stderr_tail=_tail(verified.stderr)
        )
    new_version = (verified.stdout or '').strip()
    if _same_release(new_version, latest):
        return InstallResult(ok=True, code=0, new_version=new_version)
    return InstallResult(ok=False, code=0, kept=True, new_version=new_version)


# --- auto update ----------------------------------------------------------


def _arrow(stream: IO[str] | None) -> str:
    """``→`` when the stream can encode it, else ``->``."""
    encoding = getattr(stream, 'encoding', None) or 'ascii'
    try:
        '→'.encode(encoding)
    except (UnicodeEncodeError, LookupError):
        return '->'
    return '→'


def _auto_update(config: AppConfig) -> None:
    detected = detect_install()
    if blockers(config, detected, _env(), _streams(), auto=True, force=False):
        return
    now = _now()
    if not UpdateState.load().due(now):
        return
    with update_lock() as acquired:
        if not acquired:
            return
        # Another process may have checked while this one waited; read the
        # clock again so its start is not taken for a future one.
        now = _now()
        if not UpdateState.load().due(now):
            return
        state = UpdateState(checked_at=now)
        state.save()  # before the network: a failure waits a day
        latest = fetch_latest(CHECK_TIMEOUT_SECONDS)
        state.latest_version = latest
        state.save()
        old = installed_version()
        if is_newer(latest, old) is not True:
            return
        result = install(detected, latest, INSTALL_TIMEOUT_SECONDS)
        if not result.ok:
            return
        # lib/ stays free of Typer: write the one line to stderr directly.
        stderr = sys.stderr
        arrow = _arrow(stderr)
        stderr.write(
            f'Updated applika-cli {old} {arrow} {result.new_version}\n'
        )
        stderr.flush()


def after_command(config: AppConfig) -> None:
    """The daily auto update, run when the root command's context closes.
    At most once a day, only when no gate blocks; every failure is silent,
    Ctrl-C included, so the command's output and exit status never change.
    It reads no session and calls no Applika API: it works signed out."""
    try:
        _auto_update(config)
    except (Exception, KeyboardInterrupt):
        return
