"""Himalayas scraper (KODI-046), a port of Ían Muliterno's ``himalayas.py``
(``job_scrapping``, commit ``e670914``).

Kept from his file: the public JSON API (``/jobs/api``, ``offset``/``limit``
paging, newest first), ``cloudscraper`` to pass Cloudflare's browser check
(owner: "Keep cloudscraper"), the page budget, the stop once a whole page is
older than the cutoff, the short pause between pages, and his normalisation
of a job object (``parse_job``: location restrictions, salary range, tags
from categories and seniority, epoch-or-ISO dates).

Changed: the result is :class:`ScrapedPosting` with the R-006 fields
(employment type and salary are their own fields now, not lines prepended to
the description); the description is plain text; a Cloudflare challenge, a
403 or a 429 raises :class:`SourceBlocked` and is recorded as such instead of
falling back to the RSS feed - the admin sees the source ``blocked`` and
RemoteOK goes on (ADR-0016); every request has the
``JOBS_SCRAPER_TIMEOUT_SECONDS`` timeout.

``cloudscraper`` is synchronous and untyped, so it is reached through ONE
typed wrapper, :func:`cloudscraper_get`, and the paging loop runs in a worker
thread (``anyio.to_thread.run_sync``) so the event loop never blocks.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from typing import Any

import anyio.to_thread
import cloudscraper
import requests
from cloudscraper.exceptions import CloudflareException

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
from app.config.logging import logger

API_URL = 'https://himalayas.app/jobs/api'
PAGE_LIMIT = 20
MAX_PAGES = 50
REQUEST_DELAY_SECONDS = 0.1


@dataclass(frozen=True)
class HttpReply:
    """What the wrapper hands back: the status and the body, nothing of
    ``requests``/``cloudscraper`` leaks past it."""

    status_code: int
    body: str


def cloudscraper_get(
    url: str, params: dict[str, int], timeout: float
) -> HttpReply:
    """The one door to ``cloudscraper``: a GET with a timeout.

    A Cloudflare challenge ``cloudscraper`` cannot solve is
    :class:`SourceBlocked`; any transport error is :class:`SourceFailed`.
    """
    session = cloudscraper.create_scraper()
    session.headers.update({
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
    })
    try:
        response = session.get(url, params=params, timeout=timeout)
    except CloudflareException as exc:
        raise SourceBlocked(
            f'Himalayas Cloudflare challenge: {type(exc).__name__}'
        ) from exc
    except requests.RequestException as exc:
        raise SourceFailed(
            f'Himalayas request failed: {type(exc).__name__}'
        ) from exc
    finally:
        session.close()
    return HttpReply(status_code=response.status_code, body=response.text)


def raise_if_blocked(reply: HttpReply) -> None:
    """Ían's ``_raise_if_blocked``, widened to any 403 and to a challenge
    page served with another status."""
    if reply.status_code in (403, 429) or (
        reply.status_code >= 400 and 'Just a moment' in reply.body
    ):
        raise SourceBlocked(
            f'Himalayas refused the request (HTTP {reply.status_code})'
        )
    if reply.status_code >= 400:
        raise SourceFailed(f'Himalayas answered HTTP {reply.status_code}')


def _location_text(value: Any) -> str:
    if not isinstance(value, list) or not value:
        return 'Worldwide'
    names: list[str] = []
    for item in value:
        if isinstance(item, dict):
            name = text(
                item.get('name') or item.get('alpha2') or item.get('slug')
            )
        else:
            name = text(item)
        if name:
            names.append(name)
    return ', '.join(dedupe(names)) or 'Worldwide'


def _amount(value: Any) -> int | None:
    if value is None or value == '' or isinstance(value, bool):
        return None
    try:
        return int(float(value))
    # 1e400 and 'inf' overflow int(): no salary rather than a failed run.
    except TypeError, ValueError, OverflowError:
        return None


def _salary_text(item: dict[str, Any]) -> str | None:
    low = _amount(item.get('minSalary'))
    high = _amount(item.get('maxSalary'))
    if low is None and high is None:
        return None
    currency = text(item.get('currency'))
    if low is not None and high is not None:
        amount = f'{low:,}-{high:,}'
    elif low is not None:
        amount = f'from {low:,}'
    else:
        amount = f'up to {high:,}'
    return f'{currency} {amount}' if currency else amount


def parse_job(item: dict[str, Any]) -> ScrapedPosting | None:
    """One Himalayas API job object, or ``None`` without a title, a guid or
    an application link."""
    title = text(item.get('title'))
    external_id = text(item.get('guid'))
    job_url = text(item.get('applicationLink'))
    if not (title and external_id and job_url):
        return None

    seniority = text_list(item.get('seniority'))
    employment_type = text(item.get('employmentType'))
    tags = dedupe([
        *text_list(item.get('categories')),
        *text_list(item.get('parentCategories')),
        *seniority,
    ])
    description = html_to_text(text(item.get('description'))) or (
        html_to_text(text(item.get('excerpt')))
    )

    return ScrapedPosting(
        external_id=external_id,
        title=title,
        company_name=text(item.get('companyName')),
        job_url=job_url,
        description_text=description,
        location_text=_location_text(item.get('locationRestrictions')),
        employment_type=employment_type or None,
        salary_text=_salary_text(item),
        tags=tags,
        posted_at=parse_datetime(item.get('pubDate')),
    )


Getter = Callable[[str, dict[str, int], float], HttpReply]


def fetch_pages(
    since: datetime,
    timeout: float,
    get: Getter = cloudscraper_get,
    sleep: Callable[[float], None] = time.sleep,
) -> list[ScrapedPosting]:
    """Ían's ``_sync_fetch_json_pages``: page through the API until a page
    is empty, every dated job on it is older than ``since``, the total is
    reached, or the page budget runs out. Synchronous; runs in a thread."""
    postings: list[ScrapedPosting] = []
    offset = 0
    for page in range(MAX_PAGES):
        if page:
            sleep(REQUEST_DELAY_SECONDS)
        reply = get(API_URL, {'offset': offset, 'limit': PAGE_LIMIT}, timeout)
        raise_if_blocked(reply)
        payload = _json(reply.body)
        raw_items = payload.get('jobs')
        if not isinstance(raw_items, list) or not raw_items:
            break

        page_postings = [
            posting
            for item in raw_items
            if isinstance(item, dict) and (posting := parse_job(item))
        ]
        postings.extend(p for p in page_postings if is_recent(p, since))

        dated = [p.posted_at for p in page_postings if p.posted_at]
        if dated and all(posted < since for posted in dated):
            break
        offset += PAGE_LIMIT
        total = payload.get('totalCount')
        if isinstance(total, int) and offset >= total:
            break
    else:
        # Ían's "results are partial" warning: the budget ran out before
        # the cutoff. Himalayas lists newest first and the run is hourly, so
        # a new posting is still seen while it is among the newest
        # MAX_PAGES x PAGE_LIMIT; only the first backfill is short.
        logger.warning(
            'Himalayas page budget reached before the lookback cutoff',
            extra={
                'extra_data': {
                    'event': 'himalayas_page_budget_reached',
                    'pages': MAX_PAGES,
                    'postings': len(postings),
                }
            },
        )
    return postings


def _json(body: str) -> dict[str, Any]:
    try:
        payload = json.loads(body)
    except ValueError as exc:
        if 'Just a moment' in body:
            raise SourceBlocked(
                'Himalayas served a Cloudflare challenge'
            ) from exc
        raise SourceFailed('Himalayas answered with invalid JSON') from exc
    if not isinstance(payload, dict):
        raise SourceFailed('Himalayas answered with an unexpected payload')
    return payload


class HimalayasScraper:
    code = 'himalayas'

    def __init__(self, timeout_seconds: float, get: Getter = cloudscraper_get):
        self.timeout_seconds = timeout_seconds
        self._get = get

    async def fetch(self, since: datetime) -> list[ScrapedPosting]:
        return await anyio.to_thread.run_sync(
            partial(fetch_pages, since, self.timeout_seconds, self._get)
        )
