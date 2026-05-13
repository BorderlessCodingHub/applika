"""Himalayas job scraper — RSS-only, no cloudscraper."""
from __future__ import annotations

import asyncio
import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Iterable

import httpx

from app.application.services.job_ingestion.scrapers.base import (
    ScrapedJob,
    ScraperUnavailable,
)

_USER_AGENT = 'Applika/1.0 (job-feed-reader)'
_REQUEST_DELAY = 1.0

_RSS_CANDIDATES = (
    'https://himalayas.app/jobs.rss',
    'https://himalayas.app/jobs/feed',
)

_TAG_RE = re.compile(r'<[^>]+>')


def _str(val: object) -> str:
    if val is None:
        return ''
    return str(val).strip()


def _string_list(val: object) -> list[str]:
    if not val:
        return []
    if isinstance(val, list):
        return [s.strip() for s in val if s and s.strip()]
    parts = re.split(r'[,;|]', str(val))
    return [p.strip() for p in parts if p.strip()]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        lc = item.lower()
        if lc not in seen:
            seen.add(lc)
            out.append(item)
    return out


def _parse_datetime(val: str | None) -> datetime | None:
    if not val:
        return None
    val = val.strip()
    for fmt in (
        '%Y-%m-%dT%H:%M:%S%z',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d',
    ):
        try:
            dt = datetime.strptime(val, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _parse_rss_date(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return parsedate_to_datetime(val.strip())
    except Exception:
        return _parse_datetime(val)


def _rss_text(el: ET.Element | None) -> str:
    if el is None:
        return ''
    t = (el.text or '').strip()
    return html.unescape(t)


def _location_text(item_dict: dict) -> str:
    loc = _str(item_dict.get('location'))
    return loc or 'Remote'


def _salary_text(item_dict: dict) -> str | None:
    s = _str(item_dict.get('salary'))
    return s or None


def parse_job(item: dict) -> ScrapedJob | None:
    """Parse a single JSON API job item (testable, may not be called)."""
    uid = _str(item.get('id') or item.get('slug'))
    if not uid:
        return None
    title = _str(item.get('title'))
    company = _str(
        (item.get('company') or {}).get('name')
        if isinstance(item.get('company'), dict)
        else item.get('company')
    )
    url = _str(item.get('applicationLink') or item.get('url'))
    description = _str(item.get('description') or item.get('summary'))
    if not title or not url:
        return None
    tags = _dedupe(
        _string_list(item.get('categories'))
        + _string_list(item.get('tags'))
    )
    return ScrapedJob(
        source='himalayas',
        external_id=uid,
        title=title,
        company=company,
        location=_location_text(item),
        url=url,
        description=_TAG_RE.sub(' ', html.unescape(description)).strip(),
        tags=tags[:20],
        posted_at=_parse_datetime(_str(item.get('createdAt'))),
    )


def parse_rss(xml_body: str, cutoff: datetime) -> list[ScrapedJob]:
    """Parse Himalayas RSS feed XML into ScrapedJob list."""
    try:
        root = ET.fromstring(xml_body)
    except ET.ParseError:
        return []

    ns = {'content': 'http://purl.org/rss/1.0/modules/content/'}
    channel = root.find('channel')
    if channel is None:
        return []

    jobs: list[ScrapedJob] = []
    for item in channel.findall('item'):
        pub = _parse_rss_date(_rss_text(item.find('pubDate')))
        if pub and cutoff.tzinfo and pub.tzinfo:
            if pub < cutoff:
                continue

        guid = _rss_text(item.find('guid'))
        link = _rss_text(item.find('link'))
        external_id = guid or link
        if not external_id:
            continue

        title = _rss_text(item.find('title'))
        if not title:
            continue

        # company from author or dc:creator
        dc_ns = '{http://purl.org/dc/elements/1.1/}'
        creator = _rss_text(item.find(f'{dc_ns}creator'))
        if not creator:
            creator = _rss_text(item.find('author'))

        raw_desc = (
            _rss_text(item.find('{http://purl.org/rss/1.0/modules/content/}encoded'))
            or _rss_text(item.find('description'))
        )
        desc_text = _TAG_RE.sub(' ', html.unescape(raw_desc)).strip()

        cats: list[str] = [
            _rss_text(c)
            for c in item.findall('category')
            if _rss_text(c)
        ]

        jobs.append(
            ScrapedJob(
                source='himalayas',
                external_id=external_id,
                title=title,
                company=creator or 'Unknown',
                location='Remote',
                url=link or external_id,
                description=desc_text,
                tags=_dedupe(cats)[:20],
                posted_at=pub,
            )
        )
    return jobs


class HimalayasScraper:
    id = 'himalayas'
    display_name = 'Himalayas'

    async def fetch(self, lookback_days: int) -> Iterable[ScrapedJob]:
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        headers = {'User-Agent': _USER_AGENT}

        async with httpx.AsyncClient(
            follow_redirects=True, timeout=30.0
        ) as client:
            last_exc: Exception | None = None
            for url in _RSS_CANDIDATES:
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        jobs = parse_rss(resp.text, cutoff)
                        if jobs:
                            return jobs
                except httpx.RequestError as exc:
                    last_exc = exc
                await asyncio.sleep(_REQUEST_DELAY)

        raise ScraperUnavailable(
            f'Himalayas RSS unavailable: {last_exc}'
        )
