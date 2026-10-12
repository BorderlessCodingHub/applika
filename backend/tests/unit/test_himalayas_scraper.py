from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.application.services.job_ingestion.scrapers.himalayas import (
    HimalayasScraper,
    JsonFetchResult,
    ScraperUnavailable,
    _raise_if_blocked,
    _sync_fetch_json_pages,
    parse_job,
    parse_rss,
)

_FUTURE = datetime(2099, 1, 1, tzinfo=timezone.utc)


def test_parse_job_normalizes_himalayas_api_shape():
    job = parse_job(
        {
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
        }
    )

    assert job is not None
    assert job.source == 'himalayas'
    assert job.external_id == 'linear-senior-backend-engineer-abc123'
    assert job.company == 'Linear'
    assert job.location == 'United States'
    assert 'Engineering' in job.tags
    assert 'Full Time' in job.tags
    assert 'USD 180,000-220,000' in job.description
    assert job.posted_at == datetime(2026, 4, 18, tzinfo=timezone.utc)


def test_parse_job_accepts_iso_dates_and_worldwide_location():
    job = parse_job(
        {
            'guid': 'g1',
            'title': 'Product Engineer',
            'companyName': 'Acme',
            'description': 'React and Python.',
            'pubDate': '2026-04-18T10:30:00Z',
            'applicationLink': 'https://himalayas.app/jobs/g1',
            'locationRestrictions': [],
        }
    )

    assert job is not None
    assert job.location == 'Worldwide'
    assert job.posted_at == datetime(2026, 4, 18, 10, 30, tzinfo=timezone.utc)


def test_parse_job_rejects_missing_required_fields():
    assert parse_job({'title': 'No link'}) is None


def test_cloudflare_challenge_is_reported_as_unavailable():
    response = httpx.Response(
        403,
        text='<!doctype html><title>Just a moment...</title>',
        request=httpx.Request('GET', 'https://himalayas.app/jobs/api'),
    )

    with pytest.raises(ScraperUnavailable, match='Cloudflare 403'):
        _raise_if_blocked(response)


def _make_requests_response(status_code: int, json_body=None, text: str = ''):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    if json_body is not None:
        resp.json.return_value = json_body
    resp.raise_for_status = MagicMock()
    return resp


def _minimal_job_payload(offset: int = 0) -> dict:
    return {
        'jobs': [
            {
                'guid': f'job-{offset}',
                'title': 'Engineer',
                'companyName': 'Acme',
                'applicationLink': f'https://himalayas.app/jobs/job-{offset}',
                'pubDate': '2099-01-01T00:00:00Z',
            }
        ],
        'totalCount': 1,
    }


def test_sync_fetch_json_raises_on_cloudflare_403():
    cf_response = _make_requests_response(403, text='Just a moment...')

    with patch(
        'app.application.services.job_ingestion.scrapers.himalayas.cloudscraper.create_scraper'
    ) as mock_create:
        mock_scraper = MagicMock()
        mock_scraper.get.return_value = cf_response
        mock_create.return_value = mock_scraper

        with pytest.raises(ScraperUnavailable, match='Cloudflare 403'):
            _sync_fetch_json_pages(_FUTURE)


def test_sync_fetch_returns_jobs_on_success():
    ok_response = _make_requests_response(200, json_body=_minimal_job_payload())

    with patch(
        'app.application.services.job_ingestion.scrapers.himalayas.cloudscraper.create_scraper'
    ) as mock_create, patch(
        'app.application.services.job_ingestion.scrapers.himalayas.time.sleep'
    ):
        mock_scraper = MagicMock()
        mock_scraper.get.return_value = ok_response
        mock_create.return_value = mock_scraper

        result = _sync_fetch_json_pages(_FUTURE)

    assert len(result.jobs) == 1
    assert result.jobs[0].external_id == 'job-0'
    assert result.reached_cutoff is True


def test_parse_rss_returns_jobs_within_cutoff():
    xml_body = """\
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Himalayas Remote Jobs</title>
    <item>
      <title>Staff Engineer</title>
      <link>https://himalayas.app/jobs/staff-eng-xyz</link>
      <guid>staff-eng-xyz</guid>
      <pubDate>Thu, 01 Jan 2099 00:00:00 +0000</pubDate>
      <description>Lead platform engineering.</description>
      <category>Engineering</category>
    </item>
    <item>
      <title>Old Job</title>
      <link>https://himalayas.app/jobs/old-job</link>
      <guid>old-job</guid>
      <pubDate>Mon, 01 Jan 2001 00:00:00 +0000</pubDate>
      <description>Should be filtered out.</description>
    </item>
  </channel>
</rss>
"""
    jobs = parse_rss(xml_body, cutoff=datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert len(jobs) == 1
    job = jobs[0]
    assert job.source == 'himalayas'
    assert job.external_id == 'staff-eng-xyz'
    assert job.title == 'Staff Engineer'
    assert job.url == 'https://himalayas.app/jobs/staff-eng-xyz'
    assert 'Engineering' in job.tags
    assert job.posted_at == datetime(2099, 1, 1, tzinfo=timezone.utc)


def test_parse_rss_returns_empty_on_malformed_xml():
    assert parse_rss('this is not xml', _FUTURE) == []


def test_parse_rss_strips_unbound_vendor_prefixes():
    xml_body = """\
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Himalayas Remote Jobs</title>
    <himalayasJobs:lastBuildDate>Tue, 26 May 2026 09:13:32 GMT</himalayasJobs:lastBuildDate>
    <item>
      <title>Staff Engineer</title>
      <link>https://himalayas.app/jobs/staff-eng-xyz</link>
      <guid>staff-eng-xyz</guid>
      <pubDate>Thu, 01 Jan 2099 00:00:00 +0000</pubDate>
      <description>Lead platform engineering.</description>
    </item>
  </channel>
</rss>
"""
    jobs = parse_rss(xml_body, cutoff=datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert len(jobs) == 1
    assert jobs[0].external_id == 'staff-eng-xyz'


def test_sync_fetch_returns_partial_result_when_page_budget_is_hit(monkeypatch):
    monkeypatch.setattr(
        'app.application.services.job_ingestion.scrapers.himalayas._MAX_JSON_PAGES',
        2,
    )
    ok_response = _make_requests_response(
        200,
        json_body={
            'jobs': [
                {
                    'guid': 'job-0',
                    'title': 'Engineer',
                    'companyName': 'Acme',
                    'applicationLink': 'https://himalayas.app/jobs/job-0',
                    'pubDate': '2099-01-01T00:00:00Z',
                }
            ],
            'totalCount': 1000,
        },
    )
    second_response = _make_requests_response(
        200,
        json_body={
            'jobs': [
                {
                    'guid': 'job-1',
                    'title': 'Engineer II',
                    'companyName': 'Acme',
                    'applicationLink': 'https://himalayas.app/jobs/job-1',
                    'pubDate': '2099-01-01T00:00:00Z',
                }
            ],
            'totalCount': 1000,
        },
    )

    with patch(
        'app.application.services.job_ingestion.scrapers.himalayas.cloudscraper.create_scraper'
    ) as mock_create, patch(
        'app.application.services.job_ingestion.scrapers.himalayas.time.sleep'
    ):
        mock_scraper = MagicMock()
        mock_scraper.get.side_effect = [ok_response, second_response]
        mock_create.return_value = mock_scraper

        result = _sync_fetch_json_pages(_FUTURE)

    assert result == JsonFetchResult(
        jobs=[
            parse_job(ok_response.json.return_value['jobs'][0]),
            parse_job(second_response.json.return_value['jobs'][0]),
        ],
        reached_cutoff=False,
        pages_scanned=2,
    )


@pytest.mark.asyncio
async def test_fetch_falls_back_to_rss_on_cloudflare_block():
    with (
        patch(
            'app.application.services.job_ingestion.scrapers.himalayas._sync_fetch_json_pages'
        ) as mock_json,
        patch(
            'app.application.services.job_ingestion.scrapers.himalayas._fetch_rss'
        ) as mock_rss,
    ):
        mock_json.side_effect = ScraperUnavailable('Cloudflare 403')
        mock_rss.return_value = [
            parse_job(
                {
                    'guid': 'rss-job-1',
                    'title': 'Remote Dev',
                    'companyName': 'Corp',
                    'applicationLink': 'https://himalayas.app/jobs/rss-job-1',
                    'pubDate': '2099-01-01T00:00:00Z',
                }
            )
        ]

        scraper = HimalayasScraper()
        batch = await scraper.fetch(lookback_days=7)

    assert len(batch.jobs) == 1
    assert batch.jobs[0].external_id == 'rss-job-1'
    assert batch.warning == 'Himalayas JSON API failed, used RSS fallback: Cloudflare 403'
    mock_rss.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_returns_warning_when_json_scan_is_partial():
    with patch(
        'app.application.services.job_ingestion.scrapers.himalayas._sync_fetch_json_pages'
    ) as mock_json:
        mock_json.return_value = JsonFetchResult(
            jobs=[
                parse_job(
                    {
                        'guid': 'job-1',
                        'title': 'Engineer',
                        'companyName': 'Acme',
                        'applicationLink': 'https://himalayas.app/jobs/job-1',
                        'pubDate': '2099-01-01T00:00:00Z',
                    }
                )
            ],
            reached_cutoff=False,
            pages_scanned=50,
        )

        batch = await HimalayasScraper().fetch(lookback_days=7)

    assert len(batch.jobs) == 1
    assert batch.warning == (
        'Himalayas JSON API scan stopped after 50 pages before reaching the '
        '7-day cutoff; results are partial.'
    )
