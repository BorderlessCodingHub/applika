"""The fixture scraper and the registry (KODI-046, T044, plan corrections
10). ``tests/fixtures/jobs/postings.json`` is also what the e2e stack (K7)
mounts."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.application.services.job_ingestion.scrapers.base import (
    SourceFailed,
)
from app.application.services.job_ingestion.scrapers.fixture import (
    FixtureScraper,
)
from app.application.services.job_ingestion.scrapers.himalayas import (
    HimalayasScraper,
)
from app.application.services.job_ingestion.scrapers.registry import (
    FixtureRegistry,
    build_registry,
)
from app.application.services.job_ingestion.scrapers.remoteok import (
    RemoteOKScraper,
)

POSTINGS = (
    Path(__file__).resolve().parents[1] / 'fixtures' / 'jobs' / 'postings.json'
)


def _since() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=7)


async def test_the_file_is_keyed_by_source_code():
    himalayas = await FixtureScraper('himalayas', str(POSTINGS)).fetch(_since())
    remoteok = await FixtureScraper('remoteok', str(POSTINGS)).fetch(_since())

    assert [p.external_id for p in himalayas] == [
        'fixture-himalayas-backend-1',
        'fixture-himalayas-frontend-2',
    ]
    assert [p.external_id for p in remoteok] == [
        'fixture-remoteok-devops-1',
        'fixture-remoteok-data-2',
    ]


async def test_postings_carry_every_field_and_a_relative_date():
    posting = (
        await FixtureScraper('himalayas', str(POSTINGS)).fetch(_since())
    )[0]
    midnight = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    assert posting.title == 'Senior Python Backend Engineer'
    assert posting.company_name == 'Fixture Remote Co'
    assert posting.company_url == 'https://fixture-remote.example.com'
    assert posting.location_text == 'Worldwide'
    assert posting.employment_type == 'Full Time'
    assert posting.salary_text == 'USD 150,000-190,000'
    assert posting.tags == ('Python', 'PostgreSQL', 'FastAPI')
    # ``posted_days_ago: 1`` -> yesterday's midnight UTC, stable all day.
    assert posting.posted_at == midnight - timedelta(days=1)


async def test_an_unknown_code_has_no_postings():
    assert await FixtureScraper('other', str(POSTINGS)).fetch(_since()) == []


async def test_a_missing_file_is_failed(tmp_path):
    scraper = FixtureScraper('himalayas', str(tmp_path / 'absent.json'))

    with pytest.raises(SourceFailed, match='cannot be read'):
        await scraper.fetch(_since())


async def test_no_path_is_failed():
    with pytest.raises(SourceFailed, match='JOBS_FIXTURE_PATH'):
        await FixtureScraper('himalayas', None).fetch(_since())


@pytest.mark.parametrize(
    ('content', 'message'),
    [
        ('{not json', 'not JSON'),
        ('[1]', 'not an object'),
        ('{"himalayas": {"a": 1}}', 'not a list'),
    ],
)
async def test_a_malformed_file_is_failed(tmp_path, content, message):
    path = tmp_path / 'bad.json'
    path.write_text(content, encoding='utf-8')

    with pytest.raises(SourceFailed, match=message):
        await FixtureScraper('himalayas', str(path)).fetch(_since())


async def test_old_and_incomplete_postings_are_dropped(tmp_path):
    path = tmp_path / 'p.json'
    path.write_text(
        json.dumps({
            'himalayas': [
                {
                    'external_id': 'old',
                    'title': 'T',
                    'job_url': 'https://x.example/old',
                    'posted_days_ago': 8,
                },
                {
                    'external_id': 'iso',
                    'title': 'T',
                    'job_url': 'https://x.example/iso',
                    'posted_at': datetime.now(timezone.utc).isoformat(),
                },
                {'external_id': 'no-title', 'job_url': 'https://x.example'},
                'not a posting',
            ]
        }),
        encoding='utf-8',
    )

    postings = await FixtureScraper('himalayas', str(path)).fetch(_since())

    assert [p.external_id for p in postings] == ['iso']
    assert postings[0].location_text == 'Remote'


def test_registry_builds_the_named_scrapers_with_the_timeout():
    registry = build_registry(['remoteok', 'himalayas', 'unknown'], 12)

    assert set(registry) == {'remoteok', 'himalayas'}
    himalayas = registry['himalayas']
    remoteok = registry['remoteok']
    assert isinstance(himalayas, HimalayasScraper)
    assert isinstance(remoteok, RemoteOKScraper)
    assert himalayas.timeout_seconds == 12
    assert remoteok.timeout_seconds == 12


def test_registry_leaves_out_a_code_not_listed():
    assert set(build_registry(['remoteok'], 30)) == {'remoteok'}


def test_fixture_serves_every_source_code():
    registry = build_registry(['himalayas', 'fixture'], 30, str(POSTINGS))

    assert isinstance(registry, FixtureRegistry)
    for code in ('himalayas', 'remoteok', 'anything'):
        assert code in registry
        scraper = registry.get(code)
        assert isinstance(scraper, FixtureScraper)
        assert scraper.code == code
        assert scraper.path == str(POSTINGS)
    assert len(registry) == 0
    assert list(registry) == []
