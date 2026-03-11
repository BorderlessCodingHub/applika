# Exception Handling & Logging Reference

## Table of Contents
- [Domain Exceptions](#domain-exceptions)
- [Exception Handlers](#exception-handlers)
- [Adding a New Exception](#adding-a-new-exception)
- [Logging Setup](#logging-setup)
- [Using the Logger](#using-the-logger)
- [Request ID Middleware](#request-id-middleware)

## Domain Exceptions

All domain exceptions live in `app/core/exceptions.py` and inherit from `UnicornException`:

```python
class UnicornException(Exception):
    message: str

    def __init__(self, message: str):
        self.message = message

    def __str__(self):
        return f'{self.message}'


class ResourceNotFound(UnicornException): ...
class ApplicationFinalized(UnicornException): ...
class ResourceConflict(UnicornException): ...
```

Use cases raise these exceptions — they never return HTTP status codes or responses directly. The presentation layer translates them.

### When to use each exception

- **ResourceNotFound**: entity doesn't exist (→ 404)
- **ResourceConflict**: operation conflicts with current state (→ 409)
- **ApplicationFinalized**: attempt to modify a finalized application (→ 409)

## Exception Handlers

Handlers live in `app/presentation/handlers.py` and map domain exceptions to HTTP responses:

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.core import exceptions


async def _resource_not_found_handler(
    request: Request, exc: exceptions.ResourceNotFound
):
    return JSONResponse(status_code=404, content={'detail': exc.message})


async def _resource_conflict_handler(
    request: Request, exc: exceptions.ResourceConflict
):
    return JSONResponse(status_code=409, content={'detail': exc.message})


def register_handlers(app: FastAPI):
    app.add_exception_handler(
        exceptions.ResourceNotFound, _resource_not_found_handler
    )
    app.add_exception_handler(
        exceptions.ResourceConflict, _resource_conflict_handler
    )
```

Handlers are registered in `app/main.py` via `register_handlers(app)`.

## Adding a New Exception

1. Define the exception in `app/core/exceptions.py`:
   ```python
   class InsufficientPermission(UnicornException): ...
   ```

2. Add a handler in `app/presentation/handlers.py`:
   ```python
   async def _insufficient_permission_handler(
       request: Request, exc: exceptions.InsufficientPermission
   ):
       return JSONResponse(status_code=403, content={'detail': exc.message})
   ```

3. Register it in `register_handlers()`:
   ```python
   app.add_exception_handler(
       exceptions.InsufficientPermission,
       _insufficient_permission_handler
   )
   ```

4. Use it in a use case:
   ```python
   raise InsufficientPermission('You do not own this resource')
   ```

## Logging Setup

Logging is configured in `app/config/logging.py` with context-variable-based request ID propagation.

```python
import contextvars
import logging

# Context variable — set per-request by middleware
request_id_ctx = contextvars.ContextVar('request_id', default=None)

logger = logging.getLogger('app')

class RequestIdFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'request_id'):
            record.request_id = request_id_ctx.get() or 'app'
        return True
```

Log format: `[%(asctime)s] |%(levelname)s| [%(filename)s] > %(request_id)s >> %(message)s`

## Using the Logger

Import and use the `logger` from `app.config.logging`:

```python
from app.config.logging import logger

logger.info('Something happened')
logger.error('Something went wrong')
logger.exception('Unhandled error', exc_info=True)
```

Every log entry automatically includes the request ID (UUID) from the current request context, so you can trace all logs for a single request.

## Request ID Middleware

The `HTTPLifecycleMiddleware` in `app/config/middleware.py`:

1. Generates a UUID for each request
2. Sets it in `request_id_ctx` (context variable)
3. Logs the incoming request (method, URL, client IP)
4. Logs the response status code
5. Adds `X-Request-ID` header to the response

This happens automatically — no manual setup needed when adding new features.
