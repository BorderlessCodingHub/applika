import base64
import json
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api'


@dataclass
class SessionData:
    api_base_url: str
    access_token: str
    refresh_token: str
    access_expires_at: str


class SessionStore:
    def __init__(self, path: Path | None = None):
        self.path = path or (
            Path.home() / '.config' / 'applika' / 'session.json'
        )

    def load(self) -> SessionData:
        data = json.loads(self.path.read_text())
        return SessionData(**data)

    def try_load(self) -> SessionData | None:
        if not self.path.exists():
            return None
        return self.load()

    def save(self, session: SessionData) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(asdict(session), indent=2, sort_keys=True)
        fd, tmp_path = tempfile.mkstemp(
            dir=self.path.parent,
            prefix=f'{self.path.name}.',
        )
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as file:
                file.write(payload)
            os.chmod(tmp_path, 0o600)
            os.replace(tmp_path, self.path)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()


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


def expiry_from_access_token(token: str) -> str:
    payload_segment = token.split('.')[1]
    padding = '=' * (-len(payload_segment) % 4)
    payload = json.loads(
        base64.urlsafe_b64decode(payload_segment + padding)
    )
    exp = payload['exp']
    return datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
