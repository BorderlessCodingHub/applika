from __future__ import annotations

import hashlib
import html
import re

from app.application.services.job_ingestion.scrapers.registry import (
    SCRAPERS,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)

_TAG_RE = re.compile(r'<[^>]+>')


def _strip_html(text: str) -> str:
    return _TAG_RE.sub(' ', html.unescape(text or '')).strip()


class RunIngestionUseCase:
    def __init__(
        self,
        job_repo: JobRepository,
        job_source_repo: JobSourceRepository,
    ):
        self.job_repo = job_repo
        self.job_source_repo = job_source_repo

    async def execute(self) -> dict:
        summary: dict[str, dict] = {}

        for scraper_id, scraper in SCRAPERS.items():
            source = await self.job_source_repo.get_by_code(scraper_id)
            if source is None:
                source = await self.job_source_repo.create(
                    code=scraper_id,
                    name=getattr(scraper, 'display_name', scraper_id),
                    base_url='',
                )

            if not source.is_enabled:
                summary[scraper_id] = {'status': 'disabled'}
                continue

            await self.job_source_repo.update_scrape_status(
                source.id, 'running'
            )
            created = 0
            updated = 0
            errors = 0

            try:
                scraped_jobs = await scraper.fetch(lookback_days=7)
                for scraped in scraped_jobs:
                    try:
                        desc_text = _strip_html(scraped.description)
                        content_hash = hashlib.sha256(
                            desc_text.encode()
                        ).hexdigest()

                        job_data = {
                            'title': scraped.title,
                            'company_name': scraped.company,
                            'location_text': scraped.location or 'Remote',
                            'job_url': scraped.url,
                            'description_raw': scraped.description,
                            'description_text': desc_text,
                            'posted_at': scraped.posted_at,
                            'content_hash': content_hash,
                            'is_active': True,
                        }

                        job, was_created = await self.job_repo.upsert(
                            source_id=source.id,
                            external_id=scraped.external_id,
                            job_data=job_data,
                        )
                        await self.job_repo.replace_tags(
                            job.id, scraped.tags
                        )

                        if was_created:
                            created += 1
                        else:
                            updated += 1
                    except Exception:
                        errors += 1

                await self.job_source_repo.mark_scraped(source.id)
                summary[scraper_id] = {
                    'status': 'ok',
                    'created': created,
                    'updated': updated,
                    'errors': errors,
                }
            except Exception as exc:
                await self.job_source_repo.update_scrape_status(
                    source.id, 'error', error=str(exc)
                )
                summary[scraper_id] = {
                    'status': 'error',
                    'error': str(exc),
                }

        return summary
