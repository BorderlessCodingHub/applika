import os
from dataclasses import dataclass
from enum import Enum

from applika.lib.session import SessionStore

DEFAULT_API_BASE_URL = 'https://applika.dev/api'


API_BASE_URL_ENV_VAR = 'APPLIKA_API_BASE_URL'


class ApiBaseUrlSource(str, Enum):
    """Where the API base URL in use comes from."""

    FLAG = 'flag'
    ENV = 'env'
    SESSION = 'session'
    DEFAULT = 'default'


@dataclass
class AppConfig:
    api_base_url: str
    store: SessionStore
    api_base_url_source: ApiBaseUrlSource = ApiBaseUrlSource.DEFAULT


def resolve_api_base_url_with_source(
    explicit_value: str | None,
    explicit_source: ApiBaseUrlSource,
    store: SessionStore,
) -> tuple[str, ApiBaseUrlSource]:
    """The URL to use and where it comes from. ``explicit_value`` is the
    ``--api-base-url`` option's value; ``explicit_source`` says whether
    Click took it from the flag or from ``APPLIKA_API_BASE_URL``."""
    if explicit_value:
        return explicit_value.rstrip('/'), explicit_source
    env_value = os.getenv(API_BASE_URL_ENV_VAR)
    if env_value:
        return env_value.rstrip('/'), ApiBaseUrlSource.ENV
    existing = store.try_load()
    if existing:
        return existing.api_base_url.rstrip('/'), ApiBaseUrlSource.SESSION
    return DEFAULT_API_BASE_URL, ApiBaseUrlSource.DEFAULT


def resolve_api_base_url(
    explicit_value: str | None,
    store: SessionStore,
) -> str:
    url, _ = resolve_api_base_url_with_source(
        explicit_value, ApiBaseUrlSource.FLAG, store
    )
    return url


def is_default_api_base_url(url: str) -> bool:
    """True when ``url`` is ``DEFAULT_API_BASE_URL``. A trailing slash and
    the case of the scheme and host are ignored; the rest must match
    exactly, so ``http://applika.dev/api`` is not the default."""
    scheme, separator, rest = url.rstrip('/').partition('://')
    if not separator:
        return False
    host, slash, path = rest.partition('/')
    normalized = f'{scheme.lower()}://{host.lower()}{slash}{path}'
    return normalized == DEFAULT_API_BASE_URL
