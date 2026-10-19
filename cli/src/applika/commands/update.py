"""``applika update [--force]``: check PyPI now and install the latest
applika-cli with the tool it was installed with, or list every reason why
not. It works in a terminal, in CI, in a pipe or from an AI agent alike,
signed in or not: it reads no session and calls no Applika API."""

import os
import shlex
import subprocess
import sys
from collections.abc import Sequence
from contextlib import ExitStack, suppress
from typing import IO, Annotated

import httpx
import typer

from applika.config import (
    API_BASE_URL_ENV_VAR,
    DEFAULT_API_BASE_URL,
    ApiBaseUrlSource,
    AppConfig,
)
from applika.lib import updater
from applika.lib.updater import (
    DISABLE_ENV_VAR,
    PACKAGE_NAME,
    Blocker,
    BlockerKind,
    Install,
    InstallResult,
    UpdateState,
)

CHECK_TIMEOUT_SECONDS = 10.0

# How the overridden URL got there, and the way back to the default.
_URL_ORIGINS = {
    ApiBaseUrlSource.FLAG: (
        'from --api-base-url',
        'Run without --api-base-url.',
    ),
    ApiBaseUrlSource.ENV: (
        f'from {API_BASE_URL_ENV_VAR}',
        f'Unset {API_BASE_URL_ENV_VAR}.',
    ),
    ApiBaseUrlSource.SESSION: (
        'from your saved session',
        'Run applika logout, then applika login without --api-base-url.',
    ),
}

# The installer a user knows, by install method.
_TOOL_NAMES = {
    updater.UV_TOOL: 'uv',
    updater.PIPX: 'pipx',
    updater.PIP: 'pip',
}


def _command_line(argv: Sequence[str]) -> str:
    """``argv`` as a line the user can paste into their shell."""
    if os.name == 'nt':
        return subprocess.list2cmdline(list(argv))
    return shlex.join(argv)


def _glyph(stream: IO[str] | None, fancy: str, plain: str) -> str:
    """``fancy`` when ``stream`` can encode it, else ``plain``."""
    encoding = getattr(stream, 'encoding', None) or 'ascii'
    try:
        fancy.encode(encoding)
    except (UnicodeEncodeError, LookupError):
        return plain
    return fancy


def _url_line(blocker: Blocker) -> str:
    origin = (
        None if blocker.source is None else _URL_ORIGINS.get(blocker.source)
    )
    if origin is None:  # a config built without a flag, env or session
        return (
            f'Cannot update: the API base URL is {blocker.detail}, not '
            f'{DEFAULT_API_BASE_URL}. --force does not change this. '
            f'Use {DEFAULT_API_BASE_URL}.'
        )
    where, way_back = origin
    return (
        f'Cannot update: the API base URL is {blocker.detail} ({where}), '
        f'not {DEFAULT_API_BASE_URL}. --force does not change this. '
        f'{way_back}'
    )


def blocker_line(blocker: Blocker) -> str:
    """One stderr line per blocker: the reason, then the way back."""
    if blocker.kind is BlockerKind.URL_OVERRIDDEN:
        return _url_line(blocker)
    if blocker.kind is BlockerKind.SOURCE_CHECKOUT:
        return (
            f'Cannot update: {PACKAGE_NAME} runs from a source checkout '
            f'({blocker.detail}). Update it with git.'
        )
    if blocker.kind is BlockerKind.UNKNOWN_METHOD:
        return (
            f"Cannot update: can't tell how {PACKAGE_NAME} was installed. "
            'Upgrade with the tool you used: uv tool upgrade applika-cli, '
            'pipx upgrade applika-cli, or python -m pip install --upgrade '
            'applika-cli.'
        )
    if blocker.kind is BlockerKind.DISABLED_BY_ENV:
        return (
            f'Updates are turned off by {DISABLE_ENV_VAR}. Run applika '
            'update --force to update anyway.'
        )
    # NOT_INTERACTIVE belongs to the auto update only (auto=False).
    return f'Cannot update: {blocker.kind.value} ({blocker.detail}).'


def _fail(*lines: str) -> typer.Exit:
    for line in lines:
        typer.echo(line, err=True)
    return typer.Exit(1)


def _pypi_reason(exc: Exception) -> str:
    if isinstance(exc, KeyError):
        return 'its answer has no info.version'
    text = str(exc).strip()
    return text.splitlines()[0] if text else type(exc).__name__


def _save(state: UpdateState) -> None:
    # A record that cannot be written must not stop an update the user
    # asked for; the next auto update then checks again.
    with suppress(OSError):
        state.save()


def _install_failure(
    result: InstallResult, detected: Install, latest: str
) -> list[str]:
    """The stderr lines for an install that did not reach ``latest``."""
    command = _command_line(detected.argv)
    run_it = f'Run it yourself: {command}'
    tail = result.stderr_tail.splitlines() if result.stderr_tail else []
    if result.timed_out and result.code is None:
        return [
            f'Update failed: {command} timed out after '
            f'{updater.INSTALL_TIMEOUT_SECONDS:.0f} s.',
            run_it,
        ]
    if result.code:
        return [
            f'Update failed: {command} exited {result.code}.',
            *tail,
            run_it,
        ]
    # The installer exited 0; the fresh interpreter could not confirm it.
    if result.timed_out:
        why = (
            'the new version could not be confirmed within '
            f'{updater.INSTALL_TIMEOUT_SECONDS:.0f} s'
        )
    elif result.kept:
        why = (
            'the new version could not be confirmed: the installed version '
            f'reads {result.new_version!r}, not {latest}'
        )
    else:
        why = 'the new version could not be confirmed'
    return [f'Update failed: {command} ran, but {why}.', *tail, run_it]


def update(
    ctx: typer.Context,
    force: Annotated[
        bool,
        typer.Option(
            '--force',
            help=(
                'Update even when APPLIKA_DISABLE_AUTOUPDATE is set. '
                'Changes nothing else.'
            ),
        ),
    ] = False,
) -> None:
    """Update applika-cli to the latest version on PyPI."""
    config: AppConfig = ctx.obj
    detected = updater.detect_install()
    found = updater.blockers(
        config,
        detected,
        updater._env(),
        updater._streams(),
        auto=False,
        force=force,
    )
    if found:
        raise _fail(*(blocker_line(blocker) for blocker in found))
    run_it = f'Run it yourself: {_command_line(detected.argv)}'
    with ExitStack() as stack:
        try:
            acquired = stack.enter_context(updater.update_lock())
        except OSError:
            # The config folder cannot be written: no other run can hold
            # the lock there either, so the update the user asked for goes on.
            acquired = True
        if not acquired:
            raise _fail('Another applika update is running.')
        state = UpdateState(checked_at=updater._now())
        _save(state)  # before the network: every check restarts the clock
        try:
            latest = updater.fetch_latest(CHECK_TIMEOUT_SECONDS)
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise _fail(
                f'Could not reach PyPI: {_pypi_reason(exc)}', run_it
            ) from exc
        state.latest_version = latest
        _save(state)
        old = updater.installed_version()
        newer = updater.is_newer(latest, old)
        if newer is None:
            raise _fail(
                f'Cannot compare installed {old} with published {latest}.',
                run_it,
            )
        if not newer:
            typer.echo(f'{PACKAGE_NAME} {old} is up to date.')
            return
        stdout = sys.stdout
        arrow = _glyph(stdout, '→', '->')
        dots = _glyph(stdout, '…', '...')
        command = _command_line(detected.argv)
        typer.echo(
            f'Updating {PACKAGE_NAME} {old} {arrow} {latest} ({command}){dots}'
        )
        result = updater.install(
            detected, latest, updater.INSTALL_TIMEOUT_SECONDS
        )
        if result.ok:
            typer.echo(
                f'Updated {PACKAGE_NAME} {old} {arrow} {result.new_version}'
            )
            return
        if (
            result.kept
            and not result.timed_out
            and updater.parse_release(result.new_version) is not None
        ):
            tool = _TOOL_NAMES.get(detected.method, detected.method)
            raise _fail(
                f'{tool} kept {PACKAGE_NAME} {result.new_version}: your '
                'install pins that version. Reinstall without the pin to '
                'update.'
            )
        raise _fail(*_install_failure(result, detected, latest))
