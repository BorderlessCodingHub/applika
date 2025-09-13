from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

EnvType = Literal["PROD", "DEV", "TEST"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    LOG_LEVEL: str = 'INFO'
    # https://docs.python.org/3/library/logging.html#logrecord-attributes
    # 'request_id' is an unique id generated for each request
    LOG_FORMAT: str = \
        '[%(asctime)s] |%(levelname)s| [%(filename)s] > %(request_id)s >> %(message)s'

    API_PREFIX: str = '/api'
    ENVIRONMENT: EnvType = "PROD"

    CORS_ORIGINS: List[str] = ["*"]
    CORS_HEADERS: List[str] = ["*"]
    CORS_METHODS: List[str] = ["*"]

    DATABASE_URL: str
    DATABASE_ECHO: bool = False


envs = Settings()
