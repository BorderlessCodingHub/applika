"""RemoteOK job scraper — uses JSON API via httpx."""
from __future__ import annotations

import html
import re
from datetime import datetime, timedelta, timezone
from typing import Iterable

import httpx

from app.application.services.job_ingestion.scrapers.base import (
    ScrapedJob,
    ScraperUnavailable,
)

_USER_AGENT = 'Applika/1.0 (job-feed-reader)'
_API_URL = 'https://remoteok.com/api'
_TAG_RE = re.compile(r'<[^>]+>')


class RemoteOKScraper:
    id = 'remoteok'
    display_name = 'RemoteOK'

    @staticmethod
    def _parse(item: dict) -> ScrapedJob | None:
        slug = str(item.get('id') or item.get('slug') or '').strip()
        if not slug:
            return None
        title = str(item.get('position') or '').strip()
        company = str(item.get('company') or '').strip()
        url = str(item.get('url') or '').strip()
        if not title or not url:
            return None

        desc_raw = str(item.get('description') or '')
        desc_text = _TAG_RE.sub(' ', html.unescape(desc_raw)).strip()

        tags: list[str] = [
            t for t in (item.get('tags') or []) if t and str(t).strip()
        ]

        epoch = item.get('epoch')
        posted_at: datetime | None = None
        if epoch:
            try:
                posted_at = datetime.fromtimestamp(int(epoch), tz=timezone.utc)
            except (ValueError, OSError):
                pass

        location = str(item.get('location') or 'Remote').strip() or 'Remote'

        return ScrapedJob(
            source='remoteok',
            external_id=slug,
            title=title,
            company=company,
            location=location,
            url=url,
            description=desc_text,
            tags=[str(t).strip() for t in tags[:20]],
            posted_at=posted_at,
        )

    async def fetch(self, lookback_days: int) -> Iterable[ScrapedJob]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        headers = {
            'User-Agent': _USER_AGENT,
            'Accept': 'application/json',
        }
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=30.0
        ) as client:
            try:
                resp = await client.get(_API_URL, headers=headers)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise ScraperUnavailable(f'RemoteOK API error: {exc}')

        try:
            data = resp.json()
        except Exception as exc:
            raise ScraperUnavailable(f'RemoteOK JSON parse error: {exc}')

        # First item is metadata, skip it
        if isinstance(data, list) and data and isinstance(data[0], dict):
            if 'legal' in data[0] or 'statusCode' in data[0]:
                data = data[1:]

        jobs: list[ScrapedJob] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            job = self._parse(item)
            if job is None:
                continue
            if job.posted_at and job.posted_at < cutoff:
                continue
            jobs.append(job)
        return jobs
