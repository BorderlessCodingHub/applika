import re

import pytest
from typer.testing import CliRunner

from applika.lib.session import SessionData


@pytest.fixture
def runner():
    return CliRunner()


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
        if path == '/applications':
            return FakeApiClient.created_response
        if re.fullmatch(r'/applications/[^/]+/steps', path):
            return FakeApiClient.step_created_response
        if re.fullmatch(r'/applications/[^/]+/finalize', path):
            return FakeApiClient.finalized_response
        raise AssertionError(f'Unexpected POST path: {path}')

    def put_json(self, path, payload):
        FakeApiClient.captured_put_path = path
        FakeApiClient.captured_put_payload = payload
        if re.fullmatch(r'/applications/[^/]+/steps/[^/]+', path):
            return FakeApiClient.step_updated_response
        if path.startswith('/applications/'):
            return FakeApiClient.updated_response
        raise AssertionError(f'Unexpected PUT path: {path}')

    def delete(self, path):
        FakeApiClient.captured_delete_path = path


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
