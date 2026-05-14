from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Protocol


@dataclass
class ScrapedJob:
    source: str
    external_id: str
    title: str
    company: str
    location: str
    url: str
    description: str
    tags: list[str] = field(default_factory=list)
    posted_at: datetime | None = None


class BaseScraper(Protocol):
    id: str
    display_name: str

    async def fetch(self, lookback_days: int) -> Iterable[ScrapedJob]: ...


class ScraperUnavailable(RuntimeError): ...
