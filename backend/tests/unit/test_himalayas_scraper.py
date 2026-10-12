"""Himalayas scraper (KODI-046, T044) - Ían Muliterno's
``tests/unit/test_himalayas_scraper.py`` (``job_scrapping``, commit
``e670914``) ported to the new interface: ``parse_job`` returns a
``ScrapedPosting``, a block raises ``SourceBlocked`` (no RSS fallback any
more), and the paging loop takes an injected getter. Nothing here reaches
himalayas.app: every reply is a fixture or a fake.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests
from cloudscraper.exceptions import CloudflareChallengeError

from app.application.services.job_ingestion.scrapers import himalayas
from app.application.services.job_ingestion.scrapers.base import (
    SourceBlocked,
    SourceFailed,
)
from app.application.services.job_ingestion.scrapers.himalayas import (
    API_URL,
    HimalayasScraper,
    HttpReply,
    cloudscraper_get,
    fetch_pages,
    parse_job,
    raise_if_blocked,
)

FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures' / 'jobs'
NOW = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)
SINCE = NOW - timedelta(days=7)
_FUTURE = datetime(2099, 1, 1, tzinfo=timezone.utc)


def _page_body() -> str:
    return (FIXTURES / 'himalayas_page.json').read_text(encoding='utf-8')


def _reply(payload: object, status: int = 200) -> HttpReply:
    return HttpReply(status_code=status, body=json.dumps(payload))


def _job(guid: str, pub_date: str = '2099-01-01T00:00:00Z') -> dict:
    return {
        'guid': guid,
        'title': 'Engineer',
        'companyName': 'Acme',
        'applicationLink': f'https://himalayas.app/jobs/{guid}',
        'pubDate': pub_date,
    }


class _Getter:
    """Records every call and answers the queued replies in order."""

    def __init__(self, *replies: HttpReply):
        self.replies = list(replies)
        self.calls: list[tuple[str, dict[str, int], float]] = []

    def __call__(self, url, params, timeout):
        self.calls.append((url, dict(params), timeout))
        return self.replies.pop(0)


# --- parse_job (Ían's three tests, on the new fields) ----------------------


def test_parse_job_normalizes_himalayas_api_shape():
    posting = parse_job({
        'guid': 'linear-senior-backend-engineer-abc123',
        'title': 'Senior Backend Engineer',
        'companyName': 'Linear',
        'employmentType': 'Full Time',
        'seniority': ['Senior'],
        'currency': 'USD',
        'minSalary': 180000,
        'maxSalary': 220000,
        'locationRestrictions': [{'alpha2': 'US', 'name': 'United States'}],
        'timezoneRestrictions': ['UTC-8', 'UTC-5'],
        'categories': ['Engineering'],
        'parentCategories': ['Software Development'],
        'excerpt': 'Build backend systems.',
        'description': '<p>Python, PostgreSQL, and distributed systems.</p>',
        'pubDate': 1_776_470_400_000,
        'applicationLink': 'https://himalayas.app/companies/linear/jobs/backend',
    })

    assert posting is not None
    assert posting.external_id == 'linear-senior-backend-engineer-abc123'
    assert posting.company_name == 'Linear'
    assert posting.location_text == 'United States'
    assert posting.tags == ('Engineering', 'Software Development', 'Senior')
    assert posting.employment_type == 'Full Time'
    assert posting.salary_text == 'USD 180,000-220,000'
    assert posting.description_text == (
        'Python, PostgreSQL, and distributed systems.'
    )
    assert posting.job_url == (
        'https://himalayas.app/companies/linear/jobs/backend'
    )
    assert posting.posted_at == datetime(2026, 4, 18, tzinfo=timezone.utc)


def test_parse_job_accepts_iso_dates_and_worldwide_location():
    posting = parse_job({
        'guid': 'g1',
        'title': 'Product Engineer',
        'companyName': 'Acme',
        'description': 'React and Python.',
        'pubDate': '2026-04-18T10:30:00Z',
        'applicationLink': 'https://himalayas.app/jobs/g1',
        'locationRestrictions': [],
    })

    assert posting is not None
    assert posting.location_text == 'Worldwide'
    assert posting.posted_at == datetime(
        2026, 4, 18, 10, 30, tzinfo=timezone.utc
    )
    assert posting.salary_text is None
    assert posting.employment_type is None


@pytest.mark.parametrize(
    'item',
    [
        {'title': 'No link'},
        {'guid': 'g', 'title': 'No link'},
        {'guid': 'g', 'applicationLink': 'https://x.example/j'},
        {'title': 'T', 'applicationLink': 'https://x.example/j'},
    ],
)
def test_parse_job_rejects_missing_required_fields(item):
    assert parse_job(item) is None


@pytest.mark.parametrize(
    ('low', 'high', 'expected'),
    [
        (100000, None, 'EUR from 100,000'),
        (None, 90000, 'EUR up to 90,000'),
        ('n/a', None, None),
    ],
)
def test_salary_with_one_bound(low, high, expected):
    posting = parse_job({
        **_job('s'),
        'currency': 'EUR',
        'minSalary': low,
        'maxSalary': high,
    })

    assert posting is not None
    assert posting.salary_text == expected


def test_excerpt_is_the_description_when_the_body_is_empty():
    posting = parse_job({**_job('e'), 'description': '', 'excerpt': 'Short.'})

    assert posting is not None
    assert posting.description_text == 'Short.'


def test_the_fixture_page_maps_every_r006_field():
    payload = json.loads(_page_body())
    posting = parse_job(payload['jobs'][0])

    assert posting is not None
    assert posting.title == 'Senior Backend Engineer'
    assert posting.company_name == 'Acme Remote'
    assert posting.location_text == 'United States, Canada'
    assert posting.employment_type == 'Full Time'
    assert posting.salary_text == 'USD 150,000-190,000'
    assert posting.tags == (
        'Backend',
        'Python',
        'Software Development',
        'Senior',
    )
    # Plain text: tags gone, entities decoded, script content dropped.
    assert posting.description_text == (
        'We build Python services on PostgreSQL & Redis.\nFastAPI\nDocker'
    )
    assert '<' not in posting.description_text
    assert 'alert' not in posting.description_text


# --- blocked / failed --------------------------------------------------------


def test_cloudflare_challenge_is_reported_as_blocked():
    reply = HttpReply(403, '<!doctype html><title>Just a moment...</title>')

    with pytest.raises(SourceBlocked, match='HTTP 403'):
        raise_if_blocked(reply)


@pytest.mark.parametrize('status', [403, 429])
def test_403_and_429_are_blocked(status):
    with pytest.raises(SourceBlocked):
        raise_if_blocked(HttpReply(status, '{}'))


def test_a_challenge_page_with_another_status_is_blocked():
    with pytest.raises(SourceBlocked):
        raise_if_blocked(HttpReply(503, 'Just a moment...'))


def test_a_server_error_is_failed_not_blocked():
    with pytest.raises(SourceFailed, match='HTTP 500'):
        raise_if_blocked(HttpReply(500, 'oops'))


def test_fetch_pages_raises_blocked_on_cloudflare_403():
    getter = _Getter(HttpReply(403, 'Just a moment...'))

    with pytest.raises(SourceBlocked):
        fetch_pages(_FUTURE, 30, getter, sleep=lambda _: None)


def test_a_challenge_served_as_200_html_is_blocked():
    getter = _Getter(HttpReply(200, '<html>Just a moment...</html>'))

    with pytest.raises(SourceBlocked):
        fetch_pages(SINCE, 30, getter, sleep=lambda _: None)


@pytest.mark.parametrize('body', ['not json', '[1, 2]'])
def test_a_bad_payload_is_failed(body):
    getter = _Getter(HttpReply(200, body))

    with pytest.raises(SourceFailed):
        fetch_pages(SINCE, 30, getter, sleep=lambda _: None)


# --- paging -----------------------------------------------------------------


def test_fetch_pages_returns_jobs_on_success():
    getter = _Getter(_reply({'jobs': [_job('job-0')], 'totalCount': 1}))

    postings = fetch_pages(_FUTURE, 30, getter, sleep=lambda _: None)

    assert [p.external_id for p in postings] == ['job-0']
    assert getter.calls == [(API_URL, {'offset': 0, 'limit': 20}, 30)]


def test_fetch_pages_drops_postings_older_than_the_lookback():
    getter = _Getter(HttpReply(200, _page_body()))

    postings = fetch_pages(SINCE, 12, getter, sleep=lambda _: None)

    # The 8-day-old ``initech`` posting is outside the 7-day window.
    assert [p.external_id for p in postings] == [
        'acme-senior-backend-engineer-1001',
        'globex-frontend-developer-1002',
    ]
    assert getter.calls[0][2] == 12


def test_undated_postings_are_kept():
    job = _job('undated')
    del job['pubDate']
    getter = _Getter(_reply({'jobs': [job], 'totalCount': 1}))

    postings = fetch_pages(SINCE, 30, getter, sleep=lambda _: None)

    assert [p.posted_at for p in postings] == [None]


def test_paging_stops_once_a_whole_page_is_older_than_the_cutoff():
    fresh = (NOW - timedelta(days=1)).isoformat()
    stale = (NOW - timedelta(days=9)).isoformat()
    getter = _Getter(
        _reply({'jobs': [_job('a', fresh)], 'totalCount': 1000}),
        _reply({'jobs': [_job('b', stale)], 'totalCount': 1000}),
        _reply({'jobs': [_job('never', fresh)], 'totalCount': 1000}),
    )
    pauses: list[float] = []

    postings = fetch_pages(SINCE, 30, getter, sleep=pauses.append)

    assert [p.external_id for p in postings] == ['a']
    assert [c[1]['offset'] for c in getter.calls] == [0, 20]
    assert pauses == [himalayas.REQUEST_DELAY_SECONDS]


def test_paging_stops_on_an_empty_page():
    getter = _Getter(
        _reply({'jobs': [_job('a')], 'totalCount': 1000}),
        _reply({'jobs': []}),
    )

    postings = fetch_pages(SINCE, 30, getter, sleep=lambda _: None)

    assert [p.external_id for p in postings] == ['a']
    assert len(getter.calls) == 2


def test_paging_stops_at_the_page_budget(monkeypatch):
    monkeypatch.setattr(himalayas, 'MAX_PAGES', 2)
    getter = _Getter(
        _reply({'jobs': [_job('job-0')], 'totalCount': 1000}),
        _reply({'jobs': [_job('job-1')], 'totalCount': 1000}),
        _reply({'jobs': [_job('never')], 'totalCount': 1000}),
    )

    postings = fetch_pages(_FUTURE, 30, getter, sleep=lambda _: None)

    assert [p.external_id for p in postings] == ['job-0', 'job-1']
    assert len(getter.calls) == 2


# --- the scraper and the cloudscraper wrapper --------------------------------


async def test_scraper_fetch_runs_the_pages_with_its_timeout():
    getter = _Getter(HttpReply(200, _page_body()))
    scraper = HimalayasScraper(timeout_seconds=5, get=getter)

    postings = await scraper.fetch(SINCE)

    assert scraper.code == 'himalayas'
    assert len(postings) == 2
    assert getter.calls[0][2] == 5


async def test_scraper_fetch_propagates_blocked():
    scraper = HimalayasScraper(
        timeout_seconds=5, get=_Getter(HttpReply(403, 'Just a moment...'))
    )

    with pytest.raises(SourceBlocked):
        await scraper.fetch(SINCE)


def _patched_scraper(**get_kwargs):
    session = MagicMock()
    session.headers = {}
    session.get = MagicMock(**get_kwargs)
    return patch.object(
        himalayas.cloudscraper, 'create_scraper', return_value=session
    ), session


def test_wrapper_returns_status_and_body_and_passes_the_timeout():
    response = MagicMock(status_code=200, text='{"jobs": []}')
    patcher, session = _patched_scraper(return_value=response)

    with patcher:
        reply = cloudscraper_get(API_URL, {'offset': 0, 'limit': 20}, 7)

    assert reply == HttpReply(200, '{"jobs": []}')
    session.get.assert_called_once_with(
        API_URL, params={'offset': 0, 'limit': 20}, timeout=7
    )
    assert session.headers['User-Agent'] == 'Applika/1.0 (job-feed-reader)'
    session.close.assert_called_once()


def test_wrapper_maps_an_unsolved_challenge_to_blocked():
    patcher, _ = _patched_scraper(
        side_effect=CloudflareChallengeError('challenge')
    )

    with patcher, pytest.raises(SourceBlocked, match='Cloudflare'):
        cloudscraper_get(API_URL, {}, 7)


@pytest.mark.parametrize(
    'error', [requests.Timeout('slow'), requests.ConnectionError('down')]
)
def test_wrapper_maps_a_transport_error_to_failed(error):
    patcher, session = _patched_scraper(side_effect=error)

    with patcher, pytest.raises(SourceFailed) as caught:
        cloudscraper_get(API_URL, {}, 7)

    # The type only: a transport message can quote a URL or a header.
    assert str(caught.value) == (
        f'Himalayas request failed: {type(error).__name__}'
    )
    session.close.assert_called_once()
