import contextvars
import json
import logging
import os
import traceback
from datetime import datetime, timezone

from app.config.settings import envs

# context to store request id
request_id_ctx = contextvars.ContextVar('request_id', default=None)

# Custom logger to use throughout the app
logger = logging.getLogger('app')
logger.setLevel(envs.LOG_LEVEL)

# Root path of the application source code
_APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _filter_traceback(exc_info) -> str | None:
    """Extract only frames from app code, excluding
    library/framework internals."""
    if not exc_info or exc_info[1] is None:
        return None

    tb = traceback.extract_tb(exc_info[2])
    app_frames = [
        frame for frame in tb
        if _APP_ROOT in os.path.abspath(frame.filename)
    ]

    if not app_frames:
        return traceback.format_exception_only(
            exc_info[0], exc_info[1]
        )[0].strip()

    lines = []
    for frame in app_frames:
        rel_path = os.path.relpath(frame.filename, _APP_ROOT)
        lines.append(
            f'  File "{rel_path}", line {frame.lineno}, '
            f'in {frame.name}\n    {frame.line}'
        )
    exc_line = traceback.format_exception_only(
        exc_info[0], exc_info[1]
    )[0].strip()
    lines.append(exc_line)
    return '\n'.join(lines)


class JsonFormatter(logging.Formatter):
    """Structured JSON log formatter."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'module': record.filename,
            'function': record.funcName,
            'line': record.lineno,
            'request_id': getattr(record, 'request_id', None),
            'message': record.getMessage(),
        }

        if record.exc_info and record.exc_info[1] is not None:
            filtered_tb = _filter_traceback(record.exc_info)
            log_entry['exception'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'traceback': filtered_tb,
            }

        if hasattr(record, 'extra_data'):
            log_entry['data'] = record.extra_data

        return json.dumps(log_entry, default=str)


class RequestIdFilter(logging.Filter):
    """Injects request_id into all log records."""

    def filter(self, record):
        if not hasattr(record, 'request_id'):
            record.request_id = request_id_ctx.get() or 'app'
        return True


# Disable logging to console in test environment
if envs.ENVIRONMENT != 'TEST':
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JsonFormatter())
    console_handler.setLevel(envs.LOG_LEVEL)
    logger.addHandler(console_handler)

logger.addFilter(RequestIdFilter())

for name in logging.root.manager.loggerDict:
    if name.startswith('uvicorn'):
        logging.getLogger(name).disabled = True
