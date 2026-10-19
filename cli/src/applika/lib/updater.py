"""What the daily auto update and ``applika update`` share: the PyPI read,
the version compare, the ``update.json`` record and the ``update.lock``.

This module never imports ``applika.commands`` (``commands/version.py``
imports from here)."""

import json
import os
import re
import subprocess
import tempfile
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version
from pathlib import Path

import httpx

PACKAGE_NAME = 'applika-cli'
PYPI_JSON_URL = f'https://pypi.org/pypi/{PACKAGE_NAME}/json'

STATE_FILE_NAME = 'update.json'
LOCK_FILE_NAME = 'update.lock'
CHECK_INTERVAL = timedelta(hours=24)
LOCK_STALE_SECONDS = 600

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
        """Never checked, or the last check started 24 h ago or more."""
        if self.checked_at is None:
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
