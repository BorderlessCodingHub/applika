"""The scrapers a run uses, by source code (KODI-046), a port of Ían
Muliterno's ``registry.py`` (``job_scrapping``, commit ``e670914``).

His module-level ``SCRAPERS`` dict always held both boards; here the dict is
built from ``JOBS_SCRAPERS``. A code with no scraper is left out, so its
source is skipped. ``fixture`` anywhere in the list switches every source to
the fixture scraper (plan corrections 10): the returned mapping answers any
source code with a :class:`FixtureScraper` for that code.
"""

from collections.abc import Iterator, Mapping, Sequence

from app.application.services.job_ingestion.scrapers.base import BaseScraper
from app.application.services.job_ingestion.scrapers.fixture import (
    FixtureScraper,
)
from app.application.services.job_ingestion.scrapers.himalayas import (
    HimalayasScraper,
)
from app.application.services.job_ingestion.scrapers.remoteok import (
    RemoteOKScraper,
)

FIXTURE = 'fixture'


class FixtureRegistry(Mapping[str, BaseScraper]):
    """Every source code maps to the fixture scraper for that code."""

    def __init__(self, path: str | None):
        self.path = path

    def __getitem__(self, code: str) -> BaseScraper:
        return FixtureScraper(code, self.path)

    def __contains__(self, code: object) -> bool:
        return isinstance(code, str)

    def __iter__(self) -> Iterator[str]:
        return iter(())

    def __len__(self) -> int:
        return 0


def build_registry(
    codes: Sequence[str],
    timeout_seconds: float,
    fixture_path: str | None = None,
) -> Mapping[str, BaseScraper]:
    if FIXTURE in codes:
        return FixtureRegistry(fixture_path)
    known: dict[str, BaseScraper] = {
        'himalayas': HimalayasScraper(timeout_seconds),
        'remoteok': RemoteOKScraper(timeout_seconds),
    }
    return {code: known[code] for code in codes if code in known}
