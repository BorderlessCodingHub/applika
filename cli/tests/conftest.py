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
    whoami_response = {}
    captured_post_payload = None
    captured_put_payload = None
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
        if path == '/supports':
            return FakeApiClient.supports
        if path == '/companies':
            return FakeApiClient.company_matches
        if path == '/users/me':
            return FakeApiClient.whoami_response
        raise AssertionError(f'Unexpected GET path: {path}')

    def post_json(self, path, payload):
        assert path == '/applications'
        FakeApiClient.captured_post_payload = payload
        return FakeApiClient.created_response

    def put_json(self, path, payload):
        assert path.startswith('/applications/')
        FakeApiClient.captured_put_payload = payload
        return FakeApiClient.updated_response


def reset_fake_client():
    FakeApiClient.applications = []
    FakeApiClient.supports = {'platforms': []}
    FakeApiClient.company_matches = []
    FakeApiClient.created_response = {}
    FakeApiClient.updated_response = {}
    FakeApiClient.whoami_response = {}
    FakeApiClient.captured_post_payload = None
    FakeApiClient.captured_put_payload = None
    FakeApiClient.captured_application_params = None
