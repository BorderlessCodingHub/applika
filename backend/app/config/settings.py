from typing import Annotated, Literal

from pydantic import (
    Field,
    PostgresDsn,
    SecretStr,
    UrlConstraints,
    model_validator,
)
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

    # GitHub restore (ADR-0024): GitHub is no longer a sign-in, only the
    # one-shot lookup of a GitHub-era account. Unset → the restore answers
    # 503 "GitHub restore is not configured".
    GITHUB_CLIENT_ID: str | None = None
    GITHUB_CLIENT_SECRET: str | None = None
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

    # Sign in with Borderless (ADR-0026): applika is a confidential OpenID
    # Connect client of Borderless (discovery at
    # ``{BORDERLESS_ISSUER}/.well-known/openid-configuration``). Not
    # configured (issuer, client id, secret or key unset) → the sign-in
    # sends the browser back with AUTH-1018. The key is a Fernet key for the
    # refresh token (Postgres) and the access token (Redis); losing it ends
    # every web session at its next membership check.
    BORDERLESS_ISSUER: str | None = None
    BORDERLESS_CLIENT_ID: str | None = None
    BORDERLESS_CLIENT_SECRET: SecretStr | None = None
    BORDERLESS_REDIRECT_URI: str = (
        'http://127.0.0.1:8000/api/auth/borderless/callback'
    )
    BORDERLESS_TOKEN_ENCRYPTION_KEY: str | None = None
    BORDERLESS_TIMEOUT_SECONDS: float = 5.0
    BORDERLESS_REFRESH_TIMEOUT_SECONDS: float = 3.0
    BORDERLESS_LOGIN_TTL_SECONDS: int = 600
    BORDERLESS_DISCOVERY_TTL_SECONDS: int = 3600
    # The web sign-in page: every sign-in ends there, signed in or with
    # ``?error=<code>`` (``&cli=1`` for a CLI sign-in).
    WEB_SIGNIN_URI: str = 'http://127.0.0.1:8080/login'

    # Wall-clock ceiling for one server-side CV PDF render (RenderCV +
    # Typst). Past it the request fails with 500 rather than holding a
    # worker thread; nothing is persisted either way.
    CV_PDF_RENDER_TIMEOUT_SECONDS: int = 30

    LOGIN_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/docs'
    DISCORD_FEEDBACK_WEBHOOK: str | None = None

    ACCOUNT_LINK_REDIRECT_URI: str = 'http://127.0.0.1:8080/profile'
    ACCOUNT_LINK_STATE_TTL_SECONDS: int = 600

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

    @model_validator(mode='after')
    def _https_borderless_in_prod(self) -> 'Settings':
        """In PROD, a configured Borderless client talks https only: the
        issuer and the redirect URI (an unset issuer is "not configured"
        and boots, its sign-in refused with AUTH-1018)."""
        if self.ENVIRONMENT != 'PROD' or not self.BORDERLESS_ISSUER:
            return self
        for name, url in (
            ('BORDERLESS_ISSUER', self.BORDERLESS_ISSUER),
            ('BORDERLESS_REDIRECT_URI', self.BORDERLESS_REDIRECT_URI),
        ):
            if not url.lower().startswith('https://'):
                raise ValueError(f'{name} must be https in PROD')
        return self

    @property
    def borderless_configured(self) -> bool:
        """The issuer, the client id, the client secret and the token key
        are all set."""
        return bool(
            self.BORDERLESS_ISSUER
            and self.BORDERLESS_CLIENT_ID
            and self.BORDERLESS_CLIENT_SECRET
            and self.BORDERLESS_CLIENT_SECRET.get_secret_value()
            and self.BORDERLESS_TOKEN_ENCRYPTION_KEY
        )

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
