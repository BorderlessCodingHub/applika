import contextvars
import logging

from app.config.settings import envs

# context to store request id
request_id_ctx = contextvars.ContextVar('request_id', default=None)

# Custom logger to use throughout the app
logger = logging.getLogger('app')
logger.setLevel(envs.LOG_LEVEL)


# Custom Filter to add request id to logs
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        # default request id for logs out of a http request context
        if not hasattr(record, 'request_id'):
            record.request_id = request_id_ctx.get() or 'app'
        return True


log_formatter = logging.Formatter(
    envs.LOG_FORMAT, datefmt='%Y-%m-%dT%H:%M:%S%z'
)

# Disable logging to console in test environment
if envs.ENVIRONMENT != 'TEST':
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    console_handler.setLevel(envs.LOG_LEVEL)
    logger.addHandler(console_handler)

logger.addFilter(RequestIdFilter())

for name in logging.root.manager.loggerDict:
    if name.startswith('uvicorn'):
        logger.info(f"Logger '{name}' disabled")
        logging.getLogger(name).disabled = True
