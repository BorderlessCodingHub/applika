"""Seed helpers for the job collection tests (KODI-046).

``create_all`` builds the tables but not revision ``b28d5134631f``'s seed, so
:func:`seed_sources` adds the same two sources, each pointing at its own
public platform (R-019). Every company, CV and posting here is invented.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    BaseCVModel,
    JobModel,
    JobSourceModel,
    PlatformModel,
)

HIMALAYAS_ID = 8100000000000000001
REMOTEOK_ID = 8100000000000000002
HIMALAYAS_PLATFORM_ID = 8100000000000000011
REMOTEOK_PLATFORM_ID = 8100000000000000012


async def seed_sources(session: AsyncSession) -> dict[str, int]:
    """The migration's two sources and their public platforms."""
    session.add_all([
        PlatformModel(
            id=HIMALAYAS_PLATFORM_ID,
            name='Himalayas',
            url='https://himalayas.app',
            is_public=True,
        ),
        PlatformModel(
            id=REMOTEOK_PLATFORM_ID,
            name='RemoteOK',
            url='https://remoteok.com',
            is_public=True,
        ),
    ])
    await session.flush()
    session.add_all([
        JobSourceModel(
            id=HIMALAYAS_ID,
            code='himalayas',
            name='Himalayas',
            base_url='https://himalayas.app',
            platform_id=HIMALAYAS_PLATFORM_ID,
        ),
        JobSourceModel(
            id=REMOTEOK_ID,
            code='remoteok',
            name='RemoteOK',
            base_url='https://remoteok.com',
            platform_id=REMOTEOK_PLATFORM_ID,
        ),
    ])
    await session.commit()
    return {'himalayas': HIMALAYAS_ID, 'remoteok': REMOTEOK_ID}


async def seed_base_cv(
    session: AsyncSession,
    user_id: int,
    skills: list[str],
    name: str = 'Main',
) -> int:
    cv = BaseCVModel(
        user_id=user_id,
        name=name,
        full_name='Ada Example',
        headline='Engineer',
        location='Remote',
        email='ada@example.com',
        skills=[{'id': 's1', 'category': 'Tech', 'keywords': skills}],
    )
    session.add(cv)
    await session.commit()
    return cv.id


async def seed_job(
    session: AsyncSession,
    source_id: int,
    external_id: str,
    *,
    keywords: list[str] | None = None,
    posted_at: datetime | None = None,
    first_seen_at: datetime | None = None,
    is_active: bool = True,
) -> int:
    now = datetime.now(timezone.utc)
    job = JobModel(
        source_id=source_id,
        external_id=external_id,
        title='Engineer',
        company_name='Acme',
        job_url=f'https://jobs.example/{external_id}',
        description_text='Python',
        keywords=keywords if keywords is not None else ['python'],
        content_hash='0' * 64,
        posted_at=posted_at,
        first_seen_at=first_seen_at or now,
        last_seen_at=first_seen_at or now,
        is_active=is_active,
    )
    session.add(job)
    await session.commit()
    return job.id


def days_ago(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)
