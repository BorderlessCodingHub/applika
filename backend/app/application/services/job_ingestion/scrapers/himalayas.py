"""Himalayas job scraper.

Tries the public JSON API first. If that path is blocked or unavailable,
falls back to RSS.
"""
from __future__ import annotations

import asyncio
import html
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import cloudscraper
import httpx

from app.application.services.job_ingestion.scrapers.base import (
    ScrapeBatch,
    ScrapedJob,
    ScraperUnavailable,
)

_USER_AGENT = 'Applika/1.0 (job-feed-reader)'
_REQUEST_DELAY = 0.1
_API_URL = 'https://himalayas.app/jobs/api'
_PAGE_LIMIT = 20
_MAX_JSON_PAGES = 50
_RSS_CANDIDATES = (
    'https://himalayas.app/jobs/rss',
    'https://himalayas.app/jobs.rss',
    'https://himalayas.app/jobs/feed',
    'https://himalayas.app/rss',
)

_TAG_RE = re.compile(r'<[^>]+>')
_XML_TAG_PREFIX_RE = re.compile(r'<(/?)([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)([^>]*)>')


@dataclass
class JsonFetchResult:
    jobs: list[ScrapedJob]
    reached_cutoff: bool
    pages_scanned: int


def _str(value: Any) -> str:
    return str(value or '').strip()


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [_str(v) for v in value if _str(v)]
    text = _str(value)
    return [text] if text else []


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        key = value.casefold()
        if value and key not in seen:
            seen.add(key)
            out.append(value)
    return out


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ''):
        return None
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 10_000_000_000 else value
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (ValueError, OSError):
            return None
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    return None


def _location_text(value: Any) -> str:
    if not isinstance(value, list) or not value:
        return 'Worldwide'
    names: list[str] = []
    for item in value:
        if isinstance(item, dict):
            name = _str(item.get('name') or item.get('alpha2') or item.get('slug'))
        else:
            name = _str(item)
        if name:
            names.append(name)
    return ', '.join(_dedupe(names)) or 'Worldwide'


def _salary_text(item: dict[str, Any]) -> str:
    currency = _str(item.get('currency'))
    min_salary = item.get('minSalary')
    max_salary = item.get('maxSalary')
    if min_salary in (None, '') and max_salary in (None, ''):
        return ''
    parts = []
    if currency:
        parts.append(currency)
    if min_salary not in (None, '') and max_salary not in (None, ''):
        parts.append(f'{int(min_salary):,}-{int(max_salary):,}')
    elif min_salary not in (None, ''):
        parts.append(f'from {int(min_salary):,}')
    else:
        parts.append(f'up to {int(max_salary):,}')
    return ' '.join(parts)


def _raise_if_blocked(response: httpx.Response | Any) -> None:
    if response.status_code == 403 and 'Just a moment' in (response.text or ''):
        raise ScraperUnavailable(
            'Himalayas returned Cloudflare 403 for its public jobs API.'
        )
    if response.status_code == 429:
        raise ScraperUnavailable('Himalayas rate limit reached; try again later.')


def _sync_fetch_json_pages(cutoff: datetime) -> JsonFetchResult:
    scraper = cloudscraper.create_scraper()
    scraper.headers.update(
        {'User-Agent': _USER_AGENT, 'Accept': 'application/json'}
    )
    offset = 0
    jobs: list[ScrapedJob] = []
    pages_scanned = 0

    while True:
        if pages_scanned >= _MAX_JSON_PAGES:
            return JsonFetchResult(
                jobs=jobs,
                reached_cutoff=False,
                pages_scanned=pages_scanned,
            )

        response = scraper.get(
            _API_URL,
            params={'offset': offset, 'limit': _PAGE_LIMIT},
            timeout=30,
        )
        pages_scanned += 1
        _raise_if_blocked(response)
        response.raise_for_status()
        payload = response.json()
        raw_items = payload.get('jobs', [])
        if not isinstance(raw_items, list) or not raw_items:
            return JsonFetchResult(
                jobs=jobs,
                reached_cutoff=True,
                pages_scanned=pages_scanned,
            )

        page_jobs: list[ScrapedJob] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            job = parse_job(item)
            if job is None:
                continue
            page_jobs.append(job)
            if not job.posted_at or job.posted_at >= cutoff:
                jobs.append(job)

        dated_page = [job for job in page_jobs if job.posted_at is not None]
        if dated_page and all(job.posted_at < cutoff for job in dated_page):
            return JsonFetchResult(
                jobs=jobs,
                reached_cutoff=True,
                pages_scanned=pages_scanned,
            )

        offset += _PAGE_LIMIT
        total_count = payload.get('totalCount')
        if isinstance(total_count, int) and offset >= total_count:
            return JsonFetchResult(
                jobs=jobs,
                reached_cutoff=True,
                pages_scanned=pages_scanned,
            )
        time.sleep(_REQUEST_DELAY)


async def _fetch_rss(cutoff: datetime) -> list[ScrapedJob]:
    attempts: list[str] = []
    headers = {
        'User-Agent': _USER_AGENT,
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    }
    async with httpx.AsyncClient(
        follow_redirects=True, timeout=30.0
    ) as client:
        for url in _RSS_CANDIDATES:
            try:
                resp = await client.get(url, headers=headers)
                content_type = resp.headers.get('content-type', '')
                if resp.status_code == 200:
                    if 'xml' not in content_type and '<rss' not in resp.text[:200]:
                        attempts.append(
                            f'{url} returned non-feed content-type {content_type or "unknown"}'
                        )
                        continue

                    jobs = parse_rss(resp.text, cutoff)
                    if jobs:
                        return jobs
                    attempts.append(f'{url} returned 200 but produced no jobs')
                else:
                    attempts.append(f'{url} returned {resp.status_code}')
            except httpx.RequestError as exc:
                attempts.append(f'{url} request failed: {exc}')
            await asyncio.sleep(_REQUEST_DELAY)
    raise ScraperUnavailable('Himalayas RSS unavailable: ' + '; '.join(attempts))


def _sanitize_xml_body(xml_body: str) -> str:
    # Himalayas currently emits vendor-prefixed tags without declaring
    # the namespace, which makes strict XML parsers reject an otherwise
    # usable RSS document.
    return _XML_TAG_PREFIX_RE.sub(r'<\1\3\4>', xml_body)


def _rss_text(node: ET.Element, tag: str) -> str:
    el = node.find(tag)
    if el is None or el.text is None:
        return ''
    return el.text.strip()


def _parse_rss_date(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            return None


def parse_job(item: dict[str, Any]) -> ScrapedJob | None:
    """Normalize one Himalayas JSON API job object."""
    title = _str(item.get('title'))
    external_id = _str(item.get('guid'))
    url = _str(item.get('applicationLink'))
    if not (title and external_id and url):
        return None

    posted_at = _parse_datetime(item.get('pubDate'))
    categories = _string_list(item.get('categories'))
    parent_categories = _string_list(item.get('parentCategories'))
    seniority = _string_list(item.get('seniority'))
    employment_type = _str(item.get('employmentType'))
    tags = _dedupe([*categories, *parent_categories, *seniority, employment_type])

    location = _location_text(item.get('locationRestrictions'))
    timezone_restrictions = _string_list(item.get('timezoneRestrictions'))
    salary = _salary_text(item)
    excerpt = _str(item.get('excerpt'))
    description = _str(item.get('description'))
    metadata = '\n'.join(
        part
        for part in (
            excerpt,
            f'Employment type: {employment_type}' if employment_type else '',
            f'Seniority: {", ".join(seniority)}' if seniority else '',
            f'Location restrictions: {location}' if location else '',
            f'Timezone restrictions: {", ".join(timezone_restrictions)}'
            if timezone_restrictions
            else '',
            f'Salary: {salary}' if salary else '',
        )
        if part
    )
    full_description = '\n\n'.join(part for part in (metadata, description) if part)

    return ScrapedJob(
        source='himalayas',
        external_id=external_id,
        title=title,
        company=_str(item.get('companyName')),
        location=location or 'Remote',
        url=url,
        description=full_description,
        tags=tags,
        posted_at=posted_at,
    )


def parse_rss(xml_body: str, cutoff: datetime) -> list[ScrapedJob]:
    """Parse a Himalayas RSS feed into ScrapedJob records."""
    try:
        root = ET.fromstring(_sanitize_xml_body(xml_body))
    except ET.ParseError:
        return []

    channel = root.find('channel')
    items = channel.findall('item') if channel is not None else root.findall('.//item')

    jobs: list[ScrapedJob] = []
    for item in items:
        title = html.unescape(_rss_text(item, 'title'))
        link = _rss_text(item, 'link')
        if not title or not link:
            continue

        posted_at = _parse_rss_date(_rss_text(item, 'pubDate'))
        if posted_at and posted_at < cutoff:
            continue

        guid = _rss_text(item, 'guid') or link
        description = html.unescape(_rss_text(item, 'description'))
        company = (
            _rss_text(item, 'companyName')
            or _rss_text(item, '{http://purl.org/dc/elements/1.1/}creator')
            or _rss_text(item, 'author')
        )
        tags = [
            (cat.text or '').strip()
            for cat in item.findall('category')
            if (cat.text or '').strip()
        ]

        jobs.append(
            ScrapedJob(
                source='himalayas',
                external_id=guid,
                title=title,
                company=company or 'Unknown',
                location='Remote',
                url=link,
                description=description,
                tags=tags,
                posted_at=posted_at,
            )
        )
    return jobs


class HimalayasScraper:
    id = 'himalayas'
    display_name = 'Himalayas'

    async def fetch(self, lookback_days: int) -> ScrapeBatch:
        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        try:
            result = await asyncio.to_thread(_sync_fetch_json_pages, cutoff)
        except ScraperUnavailable as exc:
            try:
                jobs = await _fetch_rss(cutoff)
            except ScraperUnavailable as rss_exc:
                raise ScraperUnavailable(
                    'Himalayas JSON API failed and RSS fallback also failed: '
                    f'{exc}; {rss_exc}'
                )
            return ScrapeBatch(
                jobs=jobs,
                warning=f'Himalayas JSON API failed, used RSS fallback: {exc}',
            )

        if result.reached_cutoff:
            return ScrapeBatch(jobs=result.jobs)

        return ScrapeBatch(
            jobs=result.jobs,
            warning=(
                'Himalayas JSON API scan stopped after '
                f'{result.pages_scanned} pages before reaching the '
                f'{lookback_days}-day cutoff; results are partial.'
            ),
        )
