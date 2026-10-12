"""What every scraper returns and raises (KODI-046, R-005/R-006).

A port of Ían Muliterno's ``scrapers/base.py`` (``job_scrapping``, commit
``e670914``): his ``ScrapedJob`` becomes :class:`ScrapedPosting` with the
fields PRD 0012 R-006 keeps, his ``ScraperUnavailable`` splits into
:class:`SourceBlocked` (the board refused us) and :class:`SourceFailed`
(anything else), and ``fetch`` takes the cutoff instead of a day count.

Everything a scraper reads comes from a third-party server and is treated as
untrusted text: HTML is reduced to plain text by a parser (never executed,
never stored as markup), and every value is a ``str``/``datetime`` before it
leaves the scraper. Lengths are cut to the columns later, by the ingest use
case.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Protocol

# Ían's user agent: an honest name, not a browser disguise.
USER_AGENT = 'Applika/1.0 (job-feed-reader)'


@dataclass(frozen=True)
class ScrapedPosting:
    """One posting as a board published it (R-006).

    ``description_text`` is plain text. ``posted_at`` is aware UTC or
    ``None`` when the board gives no date.
    """

    external_id: str
    title: str
    company_name: str
    job_url: str
    description_text: str
    location_text: str = 'Remote'
    company_url: str | None = None
    employment_type: str | None = None
    salary_text: str | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)
    posted_at: datetime | None = None


class SourceBlocked(Exception):
    """The board refused the request (a Cloudflare challenge, a 403, a
    429): the run records the source as ``blocked``."""


class SourceFailed(Exception):
    """The board could not be read (network error, timeout, bad status,
    bad payload): the run records the source as ``failed``."""


class BaseScraper(Protocol):
    """A job board. ``code`` is the ``job_sources.code`` it fills."""

    code: str

    async def fetch(self, since: datetime) -> list[ScrapedPosting]:
        """The postings published at or after ``since``, plus the undated
        ones (R-005)."""
        ...


def text(value: Any) -> str:
    """A scalar from a JSON payload as trimmed text (``None`` is ``''``).

    NUL characters are dropped: Postgres text cannot hold them, and one in
    a single posting would fail the whole source's save every hour."""
    if value is None or isinstance(value, (dict, list)):
        return ''
    return str(value).replace('\x00', '').strip()


def text_list(value: Any) -> list[str]:
    """A JSON list (or a lone scalar) as trimmed, non-blank texts."""
    if isinstance(value, list):
        return [t for t in (text(v) for v in value) if t]
    single = text(value)
    return [single] if single else []


def dedupe(values: Iterable[str]) -> tuple[str, ...]:
    """Ían's ``_dedupe``: first spelling wins, compared case-insensitively."""
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        key = value.casefold()
        if value and key not in seen:
            seen.add(key)
            out.append(value)
    return tuple(out)


def parse_datetime(value: Any) -> datetime | None:
    """Ían's ``_parse_datetime``: epoch seconds or milliseconds, or ISO 8601
    (``Z`` accepted); naive values are UTC. Anything else is ``None``."""
    if value is None or value == '' or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 10_000_000_000 else value
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except ValueError, OSError, OverflowError:
            return None
    if isinstance(value, str):
        raw = value.strip()
        if raw.isdigit():
            return parse_datetime(int(raw))
        try:
            parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


def is_recent(posting: ScrapedPosting, since: datetime) -> bool:
    """R-005: published inside the lookback window, or undated."""
    return posting.posted_at is None or posting.posted_at >= since


# Tags whose end starts a new line of text; everything else is inline.
_BLOCK_TAGS = frozenset({
    'address',
    'article',
    'blockquote',
    'br',
    'dd',
    'div',
    'dl',
    'dt',
    'footer',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'section',
    'table',
    'td',
    'th',
    'tr',
    'ul',
})
# Their content is never text a reader sees.
_SKIPPED_TAGS = frozenset({'script', 'style', 'template', 'noscript'})


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skipping = 0

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in _SKIPPED_TAGS:
            self._skipping += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append('\n')

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIPPED_TAGS:
            self._skipping = max(0, self._skipping - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append('\n')

    def handle_data(self, data: str) -> None:
        if not self._skipping:
            self.parts.append(data)


def html_to_text(markup: str | None) -> str:
    """Plain text from a posting's HTML (R-006).

    Parsed with the standard library's tolerant HTML parser, never with a
    regex: entities are decoded, ``script``/``style`` content is dropped, a
    block element ends a line, runs of spaces collapse, and blank lines
    go. Plain text with no markup gets the same treatment.
    """
    if not markup:
        return ''
    extractor = _TextExtractor()
    extractor.feed(markup)
    extractor.close()
    lines = (
        ' '.join(line.split()) for line in ''.join(extractor.parts).split('\n')
    )
    return '\n'.join(line for line in lines if line).replace('\x00', '')
