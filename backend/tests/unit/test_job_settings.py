"""The background-job settings (KODI-046, ADR-0016, T040)."""

import pytest
from pydantic import ValidationError

from app.config.settings import Settings

REQUIRED = {
    'DATABASE_URL': 'postgresql+asyncpg://u:p@localhost:5432/db',
    'GITHUB_CLIENT_ID': 'x',
    'GITHUB_CLIENT_SECRET': 'x',
}


@pytest.fixture(autouse=True)
def _no_job_env(monkeypatch):
    """No ``TASKIQ_*``/``JOBS_*``/``REDIS_URL`` from the machine running the
    test, so every default asserted below is the code's own."""
    for name in (
        'TASKIQ_BROKER_URL',
        'JOBS_INGEST_ENABLED',
        'JOBS_INGEST_CRON',
        'JOBS_LOOKBACK_DAYS',
        'JOBS_RETENTION_DAYS',
        'JOBS_SCRAPER_TIMEOUT_SECONDS',
        'JOBS_INGEST_LOCK_SECONDS',
        'JOBS_SCRAPERS',
        'JOBS_FIXTURE_PATH',
        'REDIS_URL',
    ):
        monkeypatch.delenv(name, raising=False)


def _settings(**overrides: str) -> Settings:
    return Settings.model_validate({**REQUIRED, **overrides})


def test_defaults_match_adr_0016():
    settings = _settings()

    assert settings.TASKIQ_BROKER_URL is None
    assert settings.JOBS_INGEST_ENABLED is True
    assert settings.JOBS_INGEST_CRON == '0 * * * *'
    assert settings.JOBS_LOOKBACK_DAYS == 7
    assert settings.JOBS_RETENTION_DAYS == 15
    assert settings.JOBS_SCRAPER_TIMEOUT_SECONDS == 30
    assert settings.JOBS_INGEST_LOCK_SECONDS == 900
    assert settings.JOBS_SCRAPERS == 'himalayas,remoteok'
    assert settings.jobs_scrapers == ['himalayas', 'remoteok']
    assert settings.JOBS_FIXTURE_PATH is None


def test_broker_url_falls_back_to_redis_url():
    settings = _settings(REDIS_URL='redis://cache:6379/0')

    assert settings.taskiq_broker_url == 'redis://cache:6379/0'


def test_broker_url_wins_over_redis_url_when_set():
    settings = _settings(
        REDIS_URL='redis://cache:6379/0',
        TASKIQ_BROKER_URL='redis://queue:6379/1',
    )

    assert settings.taskiq_broker_url == 'redis://queue:6379/1'


def test_scraper_list_is_trimmed_and_lower_case():
    settings = _settings(JOBS_SCRAPERS=' RemoteOK , ,himalayas ')

    assert settings.jobs_scrapers == ['remoteok', 'himalayas']


def test_fixture_scraper_is_refused_in_prod():
    with pytest.raises(ValidationError, match='fixture scraper in PROD'):
        _settings(ENVIRONMENT='PROD', JOBS_SCRAPERS='himalayas, Fixture')


@pytest.mark.parametrize('environment', ['DEV', 'TEST'])
def test_fixture_scraper_is_allowed_outside_prod(environment):
    settings = _settings(ENVIRONMENT=environment, JOBS_SCRAPERS='fixture')

    assert settings.jobs_scrapers == ['fixture']


def test_prod_with_the_real_scrapers_is_accepted():
    settings = _settings(ENVIRONMENT='PROD')

    assert settings.jobs_scrapers == ['himalayas', 'remoteok']
