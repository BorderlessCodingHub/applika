"""The beta-feature gate of ``scripts/seed_mock_data.py``.

Without the "cvs" feature every master CV, CV copy and draft route answers
404, and without "jobs" every job route does: the seed skips those steps,
says why, and never fails. The script is loaded from its path and driven
through an ``httpx.MockTransport`` (no server, no network).
"""

import builtins
import importlib.util
from pathlib import Path

import httpx
import pytest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts' / 'seed_mock_data.py'

CV_STEPS = {
    'seed_base_cvs',
    'seed_cv_pdfs',
    'seed_application_cv',
    'seed_drafts',
    'seed_keyword_copy',
    'seed_draft_from_job',
}
JOB_STEPS = {'seed_job_searches', 'seed_keyword_copy', 'seed_draft_from_job'}
ALL_STEPS = CV_STEPS | JOB_STEPS

# Routes only the CV, draft and job steps call.
GATED_PREFIXES = ('/base-cvs', '/applications/drafts', '/jobs', '/job-searches')

NO_JOBS_WHY = 'No "jobs" feature for the seed user'
NO_CVS_WHY = 'No "cvs" feature for the seed user'

SUPPORTS = {
    'platforms': [{'id': 1, 'name': 'LinkedIn'}],
    'steps': [
        {'id': 1, 'name': 'Applied', 'strict': False},
        {'id': 2, 'name': 'Offer', 'strict': True},
        {'id': 3, 'name': 'Denied', 'strict': True},
    ],
    'feedbacks': [
        {'id': 1, 'name': 'Accepted'},
        {'id': 2, 'name': 'Rejected'},
    ],
}


@pytest.fixture
def seed(monkeypatch):
    """A fresh copy of the script; its module-level ``input()`` is fed."""
    monkeypatch.setattr(builtins, 'input', lambda *_: 'token')
    spec = importlib.util.spec_from_file_location('seed_under_test', SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeApi:
    """Answers the routes ``main()`` calls outside the gated steps and
    records every request it sees."""

    def __init__(self, features: set[str]) -> None:
        self.features = features
        self.requests: list[tuple[str, str]] = []
        self.next_application_id = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        method, path = request.method, request.url.path
        self.requests.append((method, path))
        if (method, path) == ('GET', '/users/me/features'):
            keys = sorted(self.features)
            return httpx.Response(
                200, json={'features': [{'key': key} for key in keys]}
            )
        if (method, path) == ('GET', '/supports'):
            return httpx.Response(200, json=SUPPORTS)
        if (method, path) == ('GET', '/platforms'):
            return httpx.Response(200, json=SUPPORTS['platforms'])
        if (method, path) in {('POST', '/platforms'), ('POST', '/companies')}:
            return httpx.Response(201, json={'id': 7})
        if (method, path) == ('POST', '/applications'):
            self.next_application_id += 1
            return httpx.Response(
                201, json={'id': self.next_application_id, 'company_id': 7}
            )
        return httpx.Response(404, json={'detail': 'Not Found'})

    def gated_requests(self) -> list[tuple[str, str]]:
        return [
            (method, path)
            for method, path in self.requests
            if path.startswith(GATED_PREFIXES) or path.endswith('/cv')
        ]


def _client(api: FakeApi) -> httpx.Client:
    return httpx.Client(
        base_url='http://seed.test', transport=httpx.MockTransport(api)
    )


def _wire(monkeypatch, seed, api: FakeApi) -> None:
    """Route ``main()``'s client through ``api`` and stub the timeline
    steps, which are not gated and would only add requests."""
    monkeypatch.setattr(
        seed, 'RetryOn429Transport', lambda: httpx.MockTransport(api)
    )
    monkeypatch.setattr(seed, 'seed_timeline', lambda *_a, **_k: False)
    monkeypatch.setattr(seed, 'seed_legacy_steps', lambda *_a, **_k: False)


def _record_steps(monkeypatch, seed) -> list[str]:
    """Swap every gated step for a recorder that answers like a success."""
    calls: list[str] = []
    answers = {
        'seed_base_cvs': ['cv-1', 'cv-2'],
        'seed_application_cv': True,
        'seed_keyword_copy': True,
    }

    def recorder(name):
        def step(*_args, **_kwargs):
            calls.append(name)
            return answers.get(name)

        return step

    for name in ALL_STEPS:
        monkeypatch.setattr(seed, name, recorder(name))
    return calls


@pytest.mark.parametrize(
    ('features', 'expected'),
    [
        (set(), False),
        ({'jobs'}, True),
        ({'cvs'}, False),
        ({'jobs', 'cvs'}, True),
        ({'job'}, False),
    ],
)
def test_has_jobs_feature_reads_the_users_feature_keys(
    seed, features, expected
):
    with _client(FakeApi(features)) as client:
        assert seed.has_jobs_feature(client) is expected


@pytest.mark.parametrize(
    ('features', 'expected'),
    [
        (set(), False),
        ({'jobs'}, False),
        ({'cvs'}, True),
        ({'jobs', 'cvs'}, True),
        ({'cv'}, False),
    ],
)
def test_has_cvs_feature_reads_the_users_feature_keys(seed, features, expected):
    with _client(FakeApi(features)) as client:
        assert seed.has_cvs_feature(client) is expected


def test_has_jobs_feature_prints_the_keys_it_found(seed, capsys):
    with _client(FakeApi(set())) as client:
        seed.has_jobs_feature(client)
    with _client(FakeApi({'jobs', 'cvs'})) as client:
        seed.has_jobs_feature(client)

    out = capsys.readouterr().out
    assert 'Features of the seed user: none' in out
    assert "Features of the seed user: ['cvs', 'jobs']" in out


def test_a_failed_feature_lookup_is_raised_not_read_as_no_feature(seed):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={'detail': 'Session expired'})

    client = httpx.Client(
        base_url='http://seed.test', transport=httpx.MockTransport(handler)
    )
    with client, pytest.raises(httpx.HTTPStatusError):
        seed.has_cvs_feature(client)


@pytest.mark.parametrize(
    ('features', 'ran', 'skipped', 'why'),
    [
        (set(), set(), ALL_STEPS, {NO_JOBS_WHY, NO_CVS_WHY}),
        (
            {'jobs'},
            {'seed_job_searches'},
            CV_STEPS,
            {NO_CVS_WHY},
        ),
        (
            {'cvs'},
            {
                'seed_base_cvs',
                'seed_application_cv',
                'seed_drafts',
                'seed_cv_pdfs',
            },
            JOB_STEPS,
            {NO_JOBS_WHY},
        ),
        ({'jobs', 'cvs'}, ALL_STEPS, set(), set()),
    ],
    ids=['none', 'jobs', 'cvs', 'jobs+cvs'],
)
def test_main_runs_only_the_steps_the_features_allow(
    seed, monkeypatch, capsys, features, ran, skipped, why
):
    api = FakeApi(features)
    _wire(monkeypatch, seed, api)
    calls = _record_steps(monkeypatch, seed)

    seed.main()

    assert set(calls) == ran
    assert not set(calls) & skipped
    out = capsys.readouterr().out
    for message in {NO_JOBS_WHY, NO_CVS_WHY}:
        assert (message in out) is (message in why)
    assert 'Applications created: 55' in out
    assert api.gated_requests() == []


def test_main_runs_each_gated_step_once_with_both_features(seed, monkeypatch):
    _wire(monkeypatch, seed, FakeApi({'jobs', 'cvs'}))
    calls = _record_steps(monkeypatch, seed)

    seed.main()

    once = {'seed_base_cvs', 'seed_drafts', 'seed_job_searches'}
    once |= {'seed_draft_from_job', 'seed_cv_pdfs', 'seed_keyword_copy'}
    assert {name: calls.count(name) for name in once} == dict.fromkeys(once, 1)
    # Every other application of the CV plan gets a copy: 28 in the plan,
    # one of them tailored by keywords instead.
    assert calls.count('seed_application_cv') == 27


def test_main_with_no_feature_requests_no_gated_route(
    seed, monkeypatch, capsys
):
    """The real CV, draft and job steps stay in place: the gate alone keeps
    every one of their routes from being requested."""
    api = FakeApi(set())
    _wire(monkeypatch, seed, api)

    seed.main()

    assert api.gated_requests() == []
    assert not [path for _method, path in api.requests if '/cv' in path]
    out = capsys.readouterr().out
    assert NO_JOBS_WHY in out
    assert NO_CVS_WHY in out
    assert 'an admin enrols the user at /admin/features' in out
    assert 'Master CVs created: 0' in out
    assert 'Application CV copies created: 0' in out


def test_main_with_only_jobs_requests_no_cv_or_draft_route(seed, monkeypatch):
    """With the real CV and draft steps, "jobs" alone reaches the saved
    searches (recorded here) and nothing that needs a master CV, a CV copy
    or a draft."""
    api = FakeApi({'jobs'})
    _wire(monkeypatch, seed, api)
    searches: list[str] = []
    monkeypatch.setattr(
        seed, 'seed_job_searches', lambda _client: searches.append('ran')
    )

    seed.main()

    assert searches == ['ran']
    assert api.gated_requests() == []
