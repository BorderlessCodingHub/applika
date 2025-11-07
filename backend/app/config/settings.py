from typing import List, Literal

from pydantic import PostgresDsn, UrlConstraints
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
        return self.__str__().replace(
            'postgresql+asyncpg', 'postgresql')


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_ignore_empty=True,
        env_file_encoding='utf-8',
        extra='ignore',
    )

    LOG_LEVEL: str = 'INFO'
    # https://docs.python.org/3/library/logging.html#logrecord-attributes
    # 'request_id' is an unique id generated for each request
    LOG_FORMAT: str = '[%(asctime)s] |%(levelname)s| [%(filename)s] > %(request_id)s >> %(message)s'

    API_PREFIX: str = '/api'
    ENVIRONMENT: EnvType = 'DEV'

    CORS_ORIGINS: List[str] = [
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8000',
    ]
    CORS_HEADERS: List[str] = ['X-Request-ID', 'Content-Type']
    CORS_METHODS: List[str] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']

    DATABASE_URL: AsyncpgDsn
    DATABASE_ECHO: bool = False

    JWT_ALGORITHM: str = 'HS256'
    JWT_SECRET: str = 'my-jwt-secret'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    GITHUB_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/auth/github/callback'

    LOGIN_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/docs'


envs = Settings()
