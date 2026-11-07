"""The Borderless OpenID Connect settings (ADR-0026 §1): defaults, "not
configured", https in PROD, and the password-era keys ignored."""

import pytest
from pydantic import SecretStr, ValidationError

from app.config.settings import Settings

REQUIRED = {
    'DATABASE_URL': 'postgresql+asyncpg://u:p@localhost:5432/db',
    'GITHUB_CLIENT_ID': 'x',
    'GITHUB_CLIENT_SECRET': 'x',
}
CONFIGURED = {
    'BORDERLESS_ISSUER': 'https://borderless.example.test/api/auth',
    'BORDERLESS_CLIENT_ID': 'client-id',
    'BORDERLESS_CLIENT_SECRET': 'client-secret',
    'BORDERLESS_REDIRECT_URI': 'https://applika.example.test/api/auth/'
    'borderless/callback',
    'BORDERLESS_TOKEN_ENCRYPTION_KEY': 'k' * 43 + '=',
}


@pytest.fixture(autouse=True)
def _no_borderless_env(monkeypatch):
    for name in (*CONFIGURED, 'ENVIRONMENT', 'BORDERLESS_API_URL'):
        monkeypatch.delenv(name, raising=False)


def _settings(**overrides) -> Settings:
    return Settings.model_validate({**REQUIRED, **overrides})


def test_defaults():
    settings = _settings()

    assert settings.BORDERLESS_ISSUER is None
    assert settings.BORDERLESS_CLIENT_ID is None
    assert settings.BORDERLESS_CLIENT_SECRET is None
    assert settings.BORDERLESS_REDIRECT_URI == (
        'http://127.0.0.1:8000/api/auth/borderless/callback'
    )
    assert settings.BORDERLESS_LOGIN_TTL_SECONDS == 600
    assert settings.BORDERLESS_DISCOVERY_TTL_SECONDS == 3600
    assert settings.BORDERLESS_TIMEOUT_SECONDS == 5.0
    assert settings.BORDERLESS_REFRESH_TIMEOUT_SECONDS == 3.0
    assert settings.borderless_configured is False


@pytest.mark.parametrize(
    'missing',
    [
        'BORDERLESS_ISSUER',
        'BORDERLESS_CLIENT_ID',
        'BORDERLESS_CLIENT_SECRET',
        'BORDERLESS_TOKEN_ENCRYPTION_KEY',
    ],
)
def test_not_configured_without_any_of_the_four(missing):
    assert _settings(**CONFIGURED).borderless_configured is True
    values = {k: v for k, v in CONFIGURED.items() if k != missing}
    assert _settings(**values).borderless_configured is False


def test_the_secret_never_shows():
    settings = _settings(**CONFIGURED)
    assert isinstance(settings.BORDERLESS_CLIENT_SECRET, SecretStr)
    assert 'client-secret' not in repr(settings)
    assert 'client-secret' not in str(settings.BORDERLESS_CLIENT_SECRET)


@pytest.mark.parametrize(
    'override',
    [
        {'BORDERLESS_ISSUER': 'http://borderless.example.test/api/auth'},
        {'BORDERLESS_REDIRECT_URI': 'http://applika.example.test/callback'},
    ],
)
def test_prod_needs_https(override):
    with pytest.raises(ValidationError, match='must be https in PROD'):
        _settings(ENVIRONMENT='PROD', **{**CONFIGURED, **override})
    # Outside PROD, http is fine (the fake Borderless, the E2E stack).
    _settings(ENVIRONMENT='DEV', **{**CONFIGURED, **override})


def test_prod_boots_unconfigured_and_configured_over_https():
    assert _settings(ENVIRONMENT='PROD').borderless_configured is False
    assert _settings(ENVIRONMENT='PROD', **CONFIGURED).borderless_configured


def test_the_password_era_keys_are_ignored():
    settings = _settings(
        BORDERLESS_API_URL='http://old.example.test',
        BORDERLESS_SIGNIN_EMAIL_LIMIT='5',
    )
    assert not hasattr(settings, 'BORDERLESS_API_URL')
