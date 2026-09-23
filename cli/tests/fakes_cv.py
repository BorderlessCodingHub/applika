"""A route-table fake API client for the KODI-018 CV commands.

Kept apart from ``conftest.py``'s ``FakeApiClient`` on purpose: that one is
shaped around the 0.1.4/0.2.0 application routes and is asserted against by
tests that must not change. This one records every call so a test can pin the
exact verb, path and body the CV commands send.
"""

from __future__ import annotations

from typing import Any

from applika.lib.api import ApiError


class FakeCvClient:
    responses: dict[tuple[str, str], Any] = {}
    raw_responses: dict[tuple[str, str], tuple[bytes, dict[str, str]]] = {}
    errors: dict[tuple[str, str], ApiError] = {}
    calls: list[tuple[str, str, Any]] = []

    def __init__(self, session, store):
        self.session = session
        self.store = store

    def close(self) -> None:
        return None

    def _call(self, method: str, path: str, payload: Any = None) -> Any:
        FakeCvClient.calls.append((method, path, payload))
        error = FakeCvClient.errors.get((method, path))
        if error is not None:
            raise error
        key = (method, path)
        if key not in FakeCvClient.responses:
            raise AssertionError(f'Unexpected {method} {path}')
        return FakeCvClient.responses[key]

    def get_json(self, path: str, *, params: Any = None) -> Any:
        return self._call('GET', path, params)

    def post_json(self, path: str, payload: Any) -> Any:
        return self._call('POST', path, payload)

    def post(self, path: str, payload: Any = None) -> Any:
        return self._call('POST', path, payload)

    def put_json(self, path: str, payload: Any) -> Any:
        return self._call('PUT', path, payload)

    def patch_json(self, path: str, payload: Any) -> Any:
        return self._call('PATCH', path, payload)

    def delete(self, path: str) -> None:
        self._call('DELETE', path)

    def fetch_raw(
        self,
        method: str,
        path: str,
    ) -> tuple[bytes, dict[str, str]]:
        FakeCvClient.calls.append((method, path, None))
        error = FakeCvClient.errors.get((method, path))
        if error is not None:
            raise error
        key = (method, path)
        if key not in FakeCvClient.raw_responses:
            raise AssertionError(f'Unexpected raw {method} {path}')
        return FakeCvClient.raw_responses[key]


def reset_fake_cv_client() -> None:
    FakeCvClient.responses = {}
    FakeCvClient.raw_responses = {}
    FakeCvClient.errors = {}
    FakeCvClient.calls = []


def body_of(method: str, path: str) -> Any:
    for call_method, call_path, payload in FakeCvClient.calls:
        if call_method == method and call_path == path:
            return payload
    raise AssertionError(f'{method} {path} was never called')


def called(method: str, path: str) -> bool:
    return any(
        call_method == method and call_path == path
        for call_method, call_path, _ in FakeCvClient.calls
    )


def sample_cv(**overrides: Any) -> dict[str, Any]:
    """A ``BaseCVOut`` as the API returns it, read-only keys included."""
    cv = {
        'id': '900',
        'created_at': '2026-09-20T10:00:00Z',
        'updated_at': '2026-09-21T10:00:00Z',
        'name': 'Backend CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Backend Engineer',
        'location': 'Lisbon',
        'email': 'ada@example.com',
        'phone': None,
        'summary': 'Builds things.',
        'links': [{'id': 'l1', 'label': 'GitHub', 'url': 'https://gh/ada'}],
        'skills': [{'id': 's1', 'category': 'Python', 'keywords': ['async']}],
        'experience': [
            {
                'id': 'e1',
                'company': 'Acme',
                'company_description': None,
                'role': 'Engineer',
                'location': None,
                'bullets': ['Shipped it'],
                'start': '2020-01',
                'end': None,
            }
        ],
        'projects': [],
        'education': [],
        'certifications': [],
        'languages': [],
    }
    cv.update(overrides)
    return cv


def sample_tailored_cv(**overrides: Any) -> dict[str, Any]:
    """A ``TailoredCVOut``: the same document plus its provenance."""
    cv = sample_cv()
    cv.update({
        'id': '950',
        'application_id': '1',
        'base_cv_id': '900',
        'was_ai_generated': False,
        'adjustments': [],
        'base_snapshot': {
            key: value
            for key, value in sample_cv().items()
            if key not in {'id', 'created_at', 'updated_at'}
        },
    })
    cv.update(overrides)
    return cv
