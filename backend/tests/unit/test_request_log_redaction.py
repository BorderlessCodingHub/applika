"""The request log never writes the sign-in callbacks' query (ADR-0026 §4):
``/auth/borderless/callback`` and ``/auth/github/callback`` carry an
authorization code and a state. The app's own request log and uvicorn's
access log both write ``?[redacted]``; every other query is kept."""

import logging

import pytest
from httpx import ASGITransport, AsyncClient

from app.config.middleware import (
    CallbackQueryFilter,
    install_access_log_redaction,
    logged_query,
)
from app.main import app as main_app


@pytest.mark.parametrize(
    ('path', 'query', 'expected'),
    [
        ('/api/auth/borderless/callback', 'code=c&state=s', '[redacted]'),
        ('/api/auth/borderless/callback/', 'code=c', '[redacted]'),
        ('/api/auth/github/callback', 'code=c&state=s', '[redacted]'),
        ('/api/auth/borderless/login', 'x=1', 'x=1'),
        ('/api/jobs', 'search=python', 'search=python'),
        ('/api/auth/borderless/callback', '', None),
    ],
)
def test_logged_query(path, query, expected):
    assert logged_query(path, query) == expected


async def test_the_request_log_redacts_the_callback_query(caplog):
    with caplog.at_level(logging.INFO, logger='app'):
        async with AsyncClient(
            transport=ASGITransport(app=main_app), base_url='http://test/api'
        ) as client:
            await client.get(
                '/auth/borderless/callback',
                params={
                    'code': 'secret-code',
                    'state': 'secret-state',
                    'iss': 'http://borderless.test/api/auth',
                },
            )
            await client.get('/supports', params={'kept': 'visible'})

    text = '\n'.join(
        f'{r.getMessage()} {getattr(r, "extra_data", "")}'
        for r in caplog.records
    )
    assert 'secret-code' not in text
    assert 'secret-state' not in text
    assert '?[redacted]' in text
    assert 'kept=visible' in text


def _access_record(target: str) -> logging.LogRecord:
    return logging.LogRecord(
        'uvicorn.access',
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ('127.0.0.1:5000', 'GET', target, '1.1', 307),
        None,
    )


def test_uvicorn_access_log_redacts_the_callback_query():
    record = _access_record(
        '/api/auth/borderless/callback?code=secret-code&state=secret-state'
    )
    assert CallbackQueryFilter().filter(record) is True
    message = record.getMessage()
    assert 'secret-code' not in message
    assert '/api/auth/borderless/callback?[redacted]' in message

    other = _access_record('/api/jobs?search=python')
    CallbackQueryFilter().filter(other)
    assert 'search=python' in other.getMessage()


def test_the_filter_is_installed_once_on_uvicorn_access():
    install_access_log_redaction()
    install_access_log_redaction()
    filters = logging.getLogger('uvicorn.access').filters
    assert sum(isinstance(f, CallbackQueryFilter) for f in filters) == 1
