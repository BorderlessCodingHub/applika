"""The fixture scraper (KODI-046, plan corrections 10): every source served
from one JSON file, for the integration tests and the e2e stack. Never in
PROD - ``Settings`` refuses ``fixture`` in ``JOBS_SCRAPERS`` there.

The file is ``{<source_code>: [<posting>, ...]}``. A posting carries the
:class:`ScrapedPosting` fields; ``posted_at`` is ISO 8601, or
``posted_days_ago`` (a whole number) dates it that many days before
today's midnight UTC, so a committed file never ages out of the lookback
window and two runs on one day see the same date. A source code absent
from the file has no postings. A missing or malformed file is
:class:`SourceFailed`.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.application.services.job_ingestion.scrapers.base import (
    ScrapedPosting,
    SourceFailed,
    is_recent,
    parse_datetime,
    text,
    text_list,
)


def _posting(item: dict[str, Any], now: datetime) -> ScrapedPosting:
    days_ago = item.get('posted_days_ago')
    if isinstance(days_ago, int) and not isinstance(days_ago, bool):
        posted_at = now - timedelta(days=days_ago)
    else:
        posted_at = parse_datetime(item.get('posted_at'))
    return ScrapedPosting(
        external_id=text(item.get('external_id')),
        title=text(item.get('title')),
        company_name=text(item.get('company_name')),
        job_url=text(item.get('job_url')),
        description_text=text(item.get('description_text')),
        location_text=text(item.get('location_text')) or 'Remote',
        company_url=text(item.get('company_url')) or None,
        employment_type=text(item.get('employment_type')) or None,
        salary_text=text(item.get('salary_text')) or None,
        tags=tuple(text_list(item.get('tags'))),
        posted_at=posted_at,
    )


class FixtureScraper:
    def __init__(self, code: str, path: str | None):
        self.code = code
        self.path = path

    def _read(self) -> dict[str, Any]:
        if not self.path:
            raise SourceFailed('JOBS_FIXTURE_PATH is not set')
        try:
            payload = json.loads(Path(self.path).read_text(encoding='utf-8'))
        except OSError as exc:
            raise SourceFailed('The jobs fixture file cannot be read') from exc
        except ValueError as exc:
            raise SourceFailed('The jobs fixture file is not JSON') from exc
        if not isinstance(payload, dict):
            raise SourceFailed('The jobs fixture file is not an object')
        return payload

    async def fetch(self, since: datetime) -> list[ScrapedPosting]:
        items = self._read().get(self.code) or []
        if not isinstance(items, list):
            raise SourceFailed(
                f'The jobs fixture for {self.code} is not a list'
            )
        # Midnight UTC: a relative date stays the same all day, so two runs
        # on one day see an unchanged posting.
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        postings = [
            _posting(item, today) for item in items if isinstance(item, dict)
        ]
        return [
            p
            for p in postings
            if p.external_id and p.title and p.job_url and is_recent(p, since)
        ]
