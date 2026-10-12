"""RemoteOK scraper (KODI-046), a port of Ían Muliterno's ``remoteok.py``
(``job_scrapping``, commit ``e670914``).

Kept from his file: one GET on the public JSON feed (``/api``) with
``httpx``, the legal/metadata first element skipped, ``id`` (else ``slug``)
as the external id, ``position``/``company``/``url``/``location``/``tags``,
the posting date from ``epoch``, and at most 20 tags.

Changed: the result is :class:`ScrapedPosting` with the R-006 fields
(``salary_min``/``salary_max`` become the salary text, ``date`` is read when
``epoch`` is missing); the description goes through the HTML parser instead
of a tag regex; the request has the ``JOBS_SCRAPER_TIMEOUT_SECONDS`` timeout;
a 403/429 is :class:`SourceBlocked`, every other failure
:class:`SourceFailed`. The transport is injectable so the tests never reach
remoteok.com.
"""

from datetime import datetime
from typing import Any

import httpx

from app.application.services.job_ingestion.scrapers.base import (
    USER_AGENT,
    ScrapedPosting,
    SourceBlocked,
    SourceFailed,
    dedupe,
    html_to_text,
    is_recent,
    parse_datetime,
    text,
    text_list,
)

API_URL = 'https://remoteok.com/api'
MAX_TAGS = 20


def _amount(value: Any) -> int | None:
    if value is None or value == '' or isinstance(value, bool):
        return None
    try:
        amount = int(float(value))
    # 1e400 and 'inf' overflow int(): no salary rather than a failed run.
    except TypeError, ValueError, OverflowError:
        return None
    return amount if amount > 0 else None


def _salary_text(item: dict[str, Any]) -> str | None:
    """RemoteOK publishes yearly USD bounds; ``0`` means "not given"."""
    low = _amount(item.get('salary_min'))
    high = _amount(item.get('salary_max'))
    if low is not None and high is not None:
        return f'USD {low:,}-{high:,}'
    if low is not None:
        return f'USD from {low:,}'
    if high is not None:
        return f'USD up to {high:,}'
    return None


def parse_item(item: dict[str, Any]) -> ScrapedPosting | None:
    """One RemoteOK feed object, or ``None`` without an id, a position or a
    url."""
    external_id = text(item.get('id')) or text(item.get('slug'))
    title = text(item.get('position'))
    job_url = text(item.get('url')) or text(item.get('apply_url'))
    if not (external_id and title and job_url):
        return None

    posted_at = parse_datetime(item.get('epoch')) or parse_datetime(
        item.get('date')
    )
    return ScrapedPosting(
        external_id=external_id,
        title=title,
        company_name=text(item.get('company')),
        job_url=job_url,
        description_text=html_to_text(text(item.get('description'))),
        location_text=text(item.get('location')) or 'Remote',
        salary_text=_salary_text(item),
        tags=dedupe(text_list(item.get('tags')))[:MAX_TAGS],
        posted_at=posted_at,
    )


class RemoteOKScraper:
    code = 'remoteok'

    def __init__(
        self,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    async def _get(self) -> httpx.Response:
        try:
            async with httpx.AsyncClient(
                transport=self._transport,
                timeout=self.timeout_seconds,
                follow_redirects=True,
                headers={
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json',
                },
            ) as client:
                return await client.get(API_URL)
        except httpx.TimeoutException as exc:
            raise SourceFailed('RemoteOK timed out') from exc
        except httpx.HTTPError as exc:
            raise SourceFailed(
                f'RemoteOK request failed: {type(exc).__name__}'
            ) from exc

    async def fetch(self, since: datetime) -> list[ScrapedPosting]:
        response = await self._get()
        if response.status_code in (403, 429):
            raise SourceBlocked(
                f'RemoteOK refused the request (HTTP {response.status_code})'
            )
        if response.status_code >= 400:
            raise SourceFailed(f'RemoteOK answered HTTP {response.status_code}')
        try:
            data = response.json()
        except ValueError as exc:
            raise SourceFailed('RemoteOK answered with invalid JSON') from exc
        if not isinstance(data, list):
            raise SourceFailed('RemoteOK answered with an unexpected payload')

        postings: list[ScrapedPosting] = []
        for item in data:
            # The first element is the feed's legal notice, not a job.
            if not isinstance(item, dict) or 'legal' in item:
                continue
            posting = parse_item(item)
            if posting is not None and is_recent(posting, since):
                postings.append(posting)
        return postings
