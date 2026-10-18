import re

import httpx
import pytest
import typer
from typer import rich_utils as typer_rich_utils
from typer.testing import CliRunner

import applika.commands.auth as auth_commands
from applika.lib.session import SessionData

RICH_TEST_WIDTH = 200


@pytest.fixture
def runner():
    return CliRunner()


TYPER_CONSOLE_KNOBS = ('FORCE_TERMINAL', 'MAX_WIDTH')


def require_typer_console_knobs(module=typer_rich_utils) -> None:
    """Fail every test with one clear message when Typer renames or drops a
    console knob the fixture below patches. A plain AttributeError from
    monkeypatch would not say what moved or what to update."""
    missing = [
        name for name in TYPER_CONSOLE_KNOBS if not hasattr(module, name)
    ]
    if missing:
        names = ', '.join(f'typer.rich_utils.{name}' for name in missing)
        pytest.fail(
            f'{names} not found in typer {typer.__version__}. Typer renamed '
            'or removed it. Update _plain_wide_rich_output and '
            'TYPER_CONSOLE_KNOBS in cli/tests/conftest.py to the knobs this '
            'typer version reads to force a terminal and to fix the console '
            'width, or pin typer to a version that has them.',
            pytrace=False,
        )


def apply_plain_wide_rich_output(monkeypatch, module=typer_rich_utils) -> None:
    require_typer_console_knobs(module)
    monkeypatch.setattr(module, 'FORCE_TERMINAL', False)
    monkeypatch.setattr(module, 'MAX_WIDTH', RICH_TEST_WIDTH)


@pytest.fixture(autouse=True)
def _plain_wide_rich_output(monkeypatch):
    """Every assert on Rich-rendered text (help, usage errors) reads plain,
    unwrapped text. typer/rich_utils.py forces a terminal at import time
    under GITHUB_ACTIONS / FORCE_COLOR / PY_COLORS, so colour codes would
    split words like ``--device-name``; an env given to CliRunner comes too
    late. A fixed wide console also stops Rich wrapping at a narrow
    COLUMNS. Typer reads both values each time it builds a console."""
    apply_plain_wide_rich_output(monkeypatch)


@pytest.fixture(autouse=True)
def _no_network_from_auth_commands(monkeypatch):
    """login/logout never reach the network in tests. A test that drives
    them installs its own ``httpx.MockTransport``."""

    def refuse(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f'Unexpected network request: {request.url}')

    monkeypatch.setattr(
        auth_commands, '_transport', httpx.MockTransport(refuse)
    )


def make_session() -> SessionData:
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
    step_created_response = {}
    step_updated_response = {}
    finalized_response = {}
    application_steps = {}
    whoami_response = {}
    captured_post_path = None
    captured_post_payload = None
    captured_put_path = None
    captured_put_payload = None
    captured_delete_path = None
    captured_application_params = None
    # Later additions below - additive only, existing attributes/behavior
    # above are untouched.
    timeline_events = {}
    event_created_response = {}
    event_updated_response = {}
    reopened_response = {}
    post_error = None
    post_json_error = None
    put_json_error = None
    delete_error = None

    def __init__(self, session, store):
        self.session = session
        self.store = store

    def close(self) -> None:
        return None

    def get_json(self, path, *, params=None):
        if path == '/applications':
            FakeApiClient.captured_application_params = params
            return FakeApiClient.applications
        match = re.fullmatch(r'/applications/([^/]+)/steps', path)
        if match:
            return FakeApiClient.application_steps.get(match.group(1), [])
        match = re.fullmatch(r'/applications/([^/]+)/timeline', path)
        if match:
            return FakeApiClient.timeline_events.get(match.group(1), [])
        if path == '/supports':
            return FakeApiClient.supports
        if path == '/companies':
            return FakeApiClient.company_matches
        if path == '/users/me':
            return FakeApiClient.whoami_response
        raise AssertionError(f'Unexpected GET path: {path}')

    def post_json(self, path, payload):
        FakeApiClient.captured_post_path = path
        FakeApiClient.captured_post_payload = payload
        if FakeApiClient.post_json_error is not None:
            raise FakeApiClient.post_json_error
        if path == '/applications':
            return FakeApiClient.created_response
        if re.fullmatch(r'/applications/[^/]+/steps', path):
            return FakeApiClient.step_created_response
        if re.fullmatch(r'/applications/[^/]+/finalize', path):
            return FakeApiClient.finalized_response
        if re.fullmatch(r'/applications/[^/]+/timeline', path):
            return FakeApiClient.event_created_response
        raise AssertionError(f'Unexpected POST path: {path}')

    def post(self, path, payload=None):
        FakeApiClient.captured_post_path = path
        FakeApiClient.captured_post_payload = payload
        if FakeApiClient.post_error is not None:
            raise FakeApiClient.post_error
        if re.fullmatch(r'/applications/[^/]+/finalize', path):
            return FakeApiClient.finalized_response
        if re.fullmatch(r'/applications/[^/]+/reopen', path):
            return FakeApiClient.reopened_response
        raise AssertionError(f'Unexpected POST path: {path}')

    def put_json(self, path, payload):
        FakeApiClient.captured_put_path = path
        FakeApiClient.captured_put_payload = payload
        if FakeApiClient.put_json_error is not None:
            raise FakeApiClient.put_json_error
        if re.fullmatch(r'/applications/[^/]+/steps/[^/]+', path):
            return FakeApiClient.step_updated_response
        if re.fullmatch(r'/applications/[^/]+/timeline/[^/]+', path):
            return FakeApiClient.event_updated_response
        if path.startswith('/applications/'):
            return FakeApiClient.updated_response
        raise AssertionError(f'Unexpected PUT path: {path}')

    def delete(self, path):
        FakeApiClient.captured_delete_path = path
        if FakeApiClient.delete_error is not None:
            raise FakeApiClient.delete_error


def reset_fake_client():
    FakeApiClient.applications = []
    FakeApiClient.supports = {'platforms': []}
    FakeApiClient.company_matches = []
    FakeApiClient.created_response = {}
    FakeApiClient.updated_response = {}
    FakeApiClient.step_created_response = {}
    FakeApiClient.step_updated_response = {}
    FakeApiClient.finalized_response = {}
    FakeApiClient.application_steps = {}
    FakeApiClient.whoami_response = {}
    FakeApiClient.captured_post_path = None
    FakeApiClient.captured_post_payload = None
    FakeApiClient.captured_put_path = None
    FakeApiClient.captured_put_payload = None
    FakeApiClient.captured_delete_path = None
    FakeApiClient.captured_application_params = None
    FakeApiClient.timeline_events = {}
    FakeApiClient.event_created_response = {}
    FakeApiClient.event_updated_response = {}
    FakeApiClient.reopened_response = {}
    FakeApiClient.post_error = None
    FakeApiClient.post_json_error = None
    FakeApiClient.put_json_error = None
    FakeApiClient.delete_error = None
