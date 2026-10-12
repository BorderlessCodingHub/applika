"""RemoteOK scraper (KODI-046, T044). Every request is answered by an
``httpx.MockTransport``; nothing here reaches remoteok.com."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from app.application.services.job_ingestion.scrapers.base import (
    SourceBlocked,
    SourceFailed,
)
from app.application.services.job_ingestion.scrapers.remoteok import (
    API_URL,
    MAX_TAGS,
    RemoteOKScraper,
    parse_item,
)

FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures' / 'jobs'
NOW = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)
SINCE = NOW - timedelta(days=7)


def _scraper(handler, timeout: float = 30) -> RemoteOKScraper:
    return RemoteOKScraper(timeout, transport=httpx.MockTransport(handler))


def _feed(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        content=(FIXTURES / 'remoteok_feed.json').read_bytes(),
        headers={'content-type': 'application/json'},
    )


async def test_feed_is_parsed_and_the_legal_notice_skipped():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return _feed(request)

    postings = await _scraper(handler).fetch(SINCE)

    # 2003 is 8 days old (dropped), 2004 has no position (dropped).
    assert [p.external_id for p in postings] == ['2001', '2002']
    assert str(requests[0].url) == API_URL
    assert requests[0].headers['user-agent'] == (
        'Applika/1.0 (job-feed-reader)'
    )


async def test_every_r006_field_is_mapped():
    postings = await _scraper(_feed).fetch(SINCE)
    platform, support = postings

    assert platform.title == 'Platform Engineer'
    assert platform.company_name == 'Hooli'
    assert platform.company_url is None
    assert platform.location_text == 'Worldwide'
    assert platform.employment_type is None
    assert platform.salary_text == 'USD 120,000-160,000'
    # Case-insensitive de-duplication keeps the first spelling.
    assert platform.tags == ('devops', 'kubernetes', 'aws')
    assert platform.posted_at == NOW - timedelta(days=2)
    assert platform.job_url == (
        'https://remoteok.com/remote-jobs/remote-platform-engineer-hooli-2001'
    )
    # HTML to plain text: tags gone, entities decoded, blocks on lines.
    assert platform.description_text == (
        'About\nRun Kubernetes on AWS.\nTerraform > clicks.'
    )
    # Blank location -> Remote; 0/0 salary -> none; ``date`` when no epoch.
    assert support.location_text == 'Remote'
    assert support.salary_text is None
    assert support.posted_at == NOW - timedelta(days=4)
    assert support.description_text == 'Plain text, no markup.'


async def test_an_eight_day_old_posting_is_dropped():
    old = {
        'id': 'old',
        'position': 'Old',
        'url': 'https://remoteok.com/old',
        'epoch': int((NOW - timedelta(days=8)).timestamp()),
    }
    fresh = {**old, 'id': 'fresh', 'epoch': int(NOW.timestamp())}

    postings = await _scraper(
        lambda r: httpx.Response(200, json=[old, fresh])
    ).fetch(SINCE)

    assert [p.external_id for p in postings] == ['fresh']


async def test_timeout_is_failed_and_uses_the_setting():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.extensions['timeout'])
        raise httpx.ReadTimeout('slow', request=request)

    with pytest.raises(SourceFailed, match='timed out'):
        await _scraper(handler, timeout=3).fetch(SINCE)
    assert seen[0]['read'] == 3


async def test_a_connection_error_is_failed():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('down', request=request)

    with pytest.raises(SourceFailed, match='ConnectError'):
        await _scraper(handler).fetch(SINCE)


@pytest.mark.parametrize('status', [403, 429])
async def test_refusals_are_blocked(status):
    with pytest.raises(SourceBlocked, match=str(status)):
        await _scraper(lambda r: httpx.Response(status)).fetch(SINCE)


async def test_a_server_error_is_failed():
    with pytest.raises(SourceFailed, match='HTTP 502'):
        await _scraper(lambda r: httpx.Response(502)).fetch(SINCE)


@pytest.mark.parametrize(
    'response',
    [
        httpx.Response(200, text='<html>maintenance</html>'),
        httpx.Response(200, json={'jobs': []}),
    ],
)
async def test_a_bad_payload_is_failed(response):
    with pytest.raises(SourceFailed):
        await _scraper(lambda r: response).fetch(SINCE)


def test_parse_item_needs_an_id_a_position_and_a_url():
    base = {'id': '1', 'position': 'P', 'url': 'https://remoteok.com/1'}

    assert parse_item(base) is not None
    by_slug = parse_item({**base, 'id': '', 'slug': 's'})
    assert by_slug is not None
    assert by_slug.external_id == 's'
    assert parse_item({**base, 'id': ''}) is None
    assert parse_item({**base, 'position': ' '}) is None
    assert parse_item({**base, 'url': ''}) is None


def test_parse_item_caps_the_tags_and_falls_back_to_apply_url():
    item = {
        'id': '9',
        'position': 'P',
        'apply_url': 'https://remoteok.com/apply/9',
        'tags': [f't{n}' for n in range(30)],
        'salary_min': 50000,
    }

    posting = parse_item(item)

    assert posting is not None
    assert len(posting.tags) == MAX_TAGS
    assert posting.job_url == 'https://remoteok.com/apply/9'
    assert posting.salary_text == 'USD from 50,000'
    assert posting.posted_at is None


def test_parse_item_salary_with_only_a_maximum():
    posting = parse_item({
        'id': '9',
        'position': 'P',
        'url': 'https://remoteok.com/9',
        'salary_max': '80000',
    })

    assert posting is not None
    assert posting.salary_text == 'USD up to 80,000'
