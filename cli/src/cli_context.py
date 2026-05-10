from dataclasses import dataclass
from datetime import date

from api import AuthError
from session import SessionData, SessionStore


@dataclass
class CommandContext:
    api_base_url: str
    store: SessionStore


def normalize_argv(argv: list[str]) -> list[str]:
    if not argv:
        return argv

    if argv[0] != 'applications':
        return argv

    if len(argv) == 1:
        return ['applications', 'list']

    if argv[1] == '-n':
        return ['applications', 'new', *argv[2:]]

    if argv[1] not in {'list', 'new', 'edit'}:
        return ['applications', 'list', *argv[1:]]

    return argv


def require_session(store: SessionStore) -> SessionData:
    session = store.try_load()
    if not session:
        raise AuthError('Please run `applika login` first.')

    return session


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def ensure_date_string(value: str) -> str:
    parse_date(value)
    return value
