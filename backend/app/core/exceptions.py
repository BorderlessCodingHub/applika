class UnicornException(Exception):
    message: str

    def __init__(self, message: str):
        self.message = message

    def __str__(self):
        return f'{self.message}'


class ResourceNotFound(UnicornException): ...


class ApplicationFinalized(UnicornException): ...


class ResourceConflict(UnicornException): ...


class BusinessRuleViolation(UnicornException): ...


class InvalidDate(UnicornException): ...


class ForbiddenAccess(UnicornException): ...


class PdfRenderFailed(UnicornException): ...


class CVExportFailed(UnicornException):
    """A CV Markdown or diff export could not be produced (KODI-017, T090/T091).

    Sibling of :class:`PdfRenderFailed` for the four new export routes
    (Markdown, diff Markdown, diff PDF): same fixed-message discipline, for
    the same reason - a Jinja or Typst failure message can quote the CV
    content that upset it, and CV content has no business in an HTTP body.
    """


class ServiceUnavailable(UnicornException):
    """A service the request needs cannot be reached right now (KODI-046):
    the background worker's queue on ``POST /admin/jobs/runs``. Mapped to
    503 with the fixed message the admin screen shows."""


SESSION_SERVICE_UNAVAILABLE = 'Session service unavailable'


class SessionServiceUnavailable(ServiceUnavailable):
    """The session store (Redis on ``REDIS_URL``) cannot be reached or timed
    out (KODI-057, ADR-0019 "Fail closed"). Mapped to 503 with
    ``Retry-After: 5``: the request is refused, never let through unchecked,
    and nobody is signed out - no client refreshes on a 503."""

    def __init__(self, message: str = SESSION_SERVICE_UNAVAILABLE):
        super().__init__(message)


class InvalidSession(UnicornException):
    """A refresh value or session that no longer resolves to a live session
    of a live user (KODI-057). ``/auth/refresh`` answers it with 401 and the
    ``refresh_token`` grant of ``POST /auth/token`` with ``invalid_grant``."""


class OAuthError(UnicornException):
    """An RFC 6749 error on ``POST /auth/token`` (KODI-057): 400
    ``{"error": <code>, "detail": <message>}``."""

    def __init__(self, error: str, message: str):
        super().__init__(message)
        self.error = error


class InvalidRequest(UnicornException):
    """A request the API refuses as malformed in a way the schema cannot
    express (KODI-057: a bad PKCE challenge on ``/auth/cli/authorize``).
    Mapped to 400 ``{"detail": <message>}``."""
