import stat
from pathlib import Path

from session import SessionData, SessionStore


def test_session_store_writes_restricted_file(tmp_path: Path):
    store = SessionStore(tmp_path / 'session.json')
    session = SessionData(
        api_base_url='http://127.0.0.1:8000/api',
        access_token='access',
        refresh_token='refresh',
        access_expires_at='2026-05-08T10:00:00+00:00',
    )

    store.save(session)

    loaded = store.load()
    assert loaded == session
    mode = stat.S_IMODE(store.path.stat().st_mode)
    assert mode == 0o600
