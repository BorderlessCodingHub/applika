from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, UrlConstraints, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ACCESS_COOKIE_NAME = '__access'
REFRESH_COOKIE_NAME = '__refresh'

EnvType = Literal['PROD', 'DEV', 'TEST']


class AsyncpgDsn(PostgresDsn):
    _constraints = UrlConstraints(
        host_required=True,
        allowed_schemes=[
            'postgresql+asyncpg',
        ],
    )

    def to_sync(self) -> str:
        return self.__str__().replace('postgresql+asyncpg', 'postgresql')


InstanceId = Annotated[int, Field(ge=0, le=1023)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        arbitrary_types_allowed=True,
        env_file='.env',
        env_ignore_empty=True,
        env_file_encoding='utf-8',
        extra='ignore',
    )

    INSTANCE_ID: InstanceId = 1023

    LOG_LEVEL: str = 'INFO'
    # https://docs.python.org/3/library/logging.html#logrecord-attributes
    # 'request_id' is an unique id generated for each request
    LOG_FORMAT: str = '[%(asctime)s] |%(levelname)s| [%(filename)s] > %(request_id)s >> %(message)s'
    LOG_FILE: str = 'logs/app.log'

    API_PREFIX: str = '/api'
    ENVIRONMENT: EnvType = 'DEV'

    CORS_ORIGINS: list[str] = [
        'http://127.0.0.1:8080',
        'http://127.0.0.1:8000',
    ]
    CORS_HEADERS: list[str] = ['X-Request-ID', 'Content-Type']
    CORS_METHODS: list[str] = [
        'GET',
        'PATCH',
        'POST',
        'PUT',
        'DELETE',
        'OPTIONS',
    ]

    DATABASE_URL: str
    DATABASE_ECHO: bool = False

    JWT_ALGORITHM: str = 'HS256'
    JWT_SECRET: str = 'changeme-set-a-strong-jwt-secret-in-production'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    GITHUB_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/auth/github/callback'

    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Device sessions and CLI sign-in (KODI-057, ADR-0019). A device code
    # lives DEVICE_CODE_TTL_SECONDS and is polled no faster than every
    # DEVICE_CODE_POLL_INTERVAL_SECONDS. DEVICE_VERIFICATION_URI is the web
    # page that approves a device code; CLI_MANUAL_REDIRECT_URI is the web
    # page that shows a PKCE code to paste (``redirect_uri=oob``). Ended
    # devices stay listed SESSION_HISTORY_DAYS after they end.
    DEVICE_CODE_TTL_SECONDS: int = 600
    DEVICE_CODE_POLL_INTERVAL_SECONDS: int = 10
    DEVICE_VERIFICATION_URI: str = 'http://127.0.0.1:8080/device'
    CLI_MANUAL_REDIRECT_URI: str = 'http://127.0.0.1:8080/cli/code'
    SESSION_HISTORY_DAYS: int = 30

    REDIS_URL: str = 'redis://localhost:6379/0'
    GITHUB_CACHE_TTL_SECONDS: int = 600  # 10 minutes

    GITHUB_TOKEN_ENCRYPTION_KEY: str = 'changeme-set-a-fernet-key-in-production'

    # Wall-clock ceiling for one server-side CV PDF render (RenderCV +
    # Typst). Past it the request fails with 500 rather than holding a
    # worker thread; nothing is persisted either way.
    CV_PDF_RENDER_TIMEOUT_SECONDS: int = 30

    LOGIN_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/docs'
    DISCORD_FEEDBACK_WEBHOOK: str | None = None

    # Discord account link (KODI-020, ADR 0008): connecting Discord from the
    # profile is optional and separate from GitHub login. Unset by default -
    # ``DiscordOAuthService.is_configured()`` is False until both the client
    # id and secret are set, and the begin route answers 503 until then.
    DISCORD_CLIENT_ID: str | None = None
    DISCORD_CLIENT_SECRET: str | None = None
    DISCORD_LINK_REDIRECT_URI: str = (
        'http://127.0.0.1:8000/api/auth/link/discord/callback'
    )
    ACCOUNT_LINK_REDIRECT_URI: str = 'http://127.0.0.1:8080/profile'
    ACCOUNT_LINK_STATE_TTL_SECONDS: int = 600

    # Fernet key for the Discord connection's encrypted refresh token
    # (KODI-024, ADR-0013). Its own secret, distinct from
    # ``GITHUB_TOKEN_ENCRYPTION_KEY``. Unset by default:
    # ``DiscordOAuthService.is_configured()`` is False until the id, the
    # secret AND this key are all set.
    DISCORD_TOKEN_ENCRYPTION_KEY: str | None = None

    # API rate limiter (KODI-039, ADR-0015): per user with an IP fallback,
    # fixed window in Redis. Environment settings, so changing them takes a
    # restart, not a release (R-020).
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: int = 120
    RATE_LIMIT_AUTH: int = 10
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Background jobs (KODI-046, ADR-0016): the taskiq broker and the hourly
    # job collection. ``TASKIQ_BROKER_URL`` unset means the broker shares
    # ``REDIS_URL`` (owner, at plan approval). ``JOBS_SCRAPERS`` is a comma
    # list of scraper codes; ``fixture`` serves every source from
    # ``JOBS_FIXTURE_PATH`` (tests and the e2e stack) and is refused in PROD.
    TASKIQ_BROKER_URL: str | None = None
    JOBS_INGEST_ENABLED: bool = True
    JOBS_INGEST_CRON: str = '0 * * * *'
    JOBS_LOOKBACK_DAYS: int = Field(default=7, ge=1)
    JOBS_RETENTION_DAYS: int = Field(default=15, ge=1)
    JOBS_SCRAPER_TIMEOUT_SECONDS: int = Field(default=30, ge=1)
    JOBS_INGEST_LOCK_SECONDS: int = Field(default=900, ge=1)
    JOBS_SCRAPERS: str = 'himalayas,remoteok'
    JOBS_FIXTURE_PATH: str | None = None

    @model_validator(mode='after')
    def _no_fixture_scraper_in_prod(self) -> 'Settings':
        if self.ENVIRONMENT == 'PROD' and 'fixture' in self.jobs_scrapers:
            raise ValueError(
                'JOBS_SCRAPERS must not name the fixture scraper in PROD'
            )
        return self

    @property
    def jobs_scrapers(self) -> list[str]:
        """``JOBS_SCRAPERS`` as a list of codes: trimmed, lower case, no
        blanks."""
        return [
            code.strip().lower()
            for code in self.JOBS_SCRAPERS.split(',')
            if code.strip()
        ]

    @property
    def taskiq_broker_url(self) -> str:
        return self.TASKIQ_BROKER_URL or self.REDIS_URL

    @property
    def openapi_url(self):
        if self.ENVIRONMENT == 'PROD':
            return None
        return '/openapi.json'


envs = Settings()  # ty: ignore[missing-argument]
