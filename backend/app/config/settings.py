from typing import Annotated, List, Literal

from pydantic import Field, PostgresDsn, UrlConstraints
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

    CORS_ORIGINS: List[str] = [
        'http://127.0.0.1:8080',
        'http://127.0.0.1:8000',
    ]
    CORS_HEADERS: List[str] = ['X-Request-ID', 'Content-Type']
    CORS_METHODS: List[str] = ['GET', 'PATCH',
                               'POST', 'PUT', 'DELETE', 'OPTIONS']

    DATABASE_URL: str
    DATABASE_ECHO: bool = False

    JWT_ALGORITHM: str = 'HS256'
    JWT_SECRET: str = 'changeme-set-a-strong-jwt-secret-in-production'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    GITHUB_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/auth/github/callback'

    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    REDIS_URL: str = 'redis://localhost:6379/0'
    GITHUB_CACHE_TTL_SECONDS: int = 600  # 10 minutes

    GITHUB_TOKEN_ENCRYPTION_KEY: str = (
        'changeme-set-a-fernet-key-in-production'
    )
    DISCORD_REPORTS_ORGANIZATION: str | None = None

    LOGIN_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/docs'
    DISCORD_REPORTS_WEBHOOK: str | None = None
    DISCORD_FEEDBACK_WEBHOOK: str | None = None

    @property
    def openapi_url(self):
        if self.ENVIRONMENT == 'PROD':
            return None
        return '/openapi.json'


envs = Settings()
