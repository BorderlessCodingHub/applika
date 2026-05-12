import os
from dataclasses import dataclass

from applika.lib.session import SessionStore

DEFAULT_API_BASE_URL = 'https://applika.dev/api'


@dataclass
class AppConfig:
    api_base_url: str
    store: SessionStore


def resolve_api_base_url(
    explicit_value: str | None,
    store: SessionStore,
) -> str:
    if explicit_value:
        return explicit_value.rstrip('/')
    env_value = os.getenv('APPLIKA_API_BASE_URL')
    if env_value:
        return env_value.rstrip('/')
    existing = store.try_load()
    if existing:
        return existing.api_base_url.rstrip('/')
    return DEFAULT_API_BASE_URL
