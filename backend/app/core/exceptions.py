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


class CodedRefusal(UnicornException):
    """A refusal with a fixed status, an optional machine ``code`` and
    optional headers (ADR-0024). Mapped to
    ``{"detail": <message>, "code": <code>}`` (``code`` omitted when
    ``None``)."""

    status_code: int = 400
    code: str | None = None

    def __init__(self, message: str, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.headers = headers or {}


INVALID_CREDENTIALS = 'Invalid email or password'
EMAIL_UNVERIFIED = 'Verify your email on Borderless first'
BORDERLESS_UNAVAILABLE = 'Borderless is unavailable, try again later'
BORDERLESS_NOT_CONFIGURED = 'Borderless sign-in is not configured'
BADGE_REQUIRED = 'Reports are for Borderless BASE and PSP members'
MEMBERSHIP_UNCONFIRMED = 'Sign in again to confirm your membership'
EMAIL_UNUSABLE = (
    'This Borderless email cannot be used with applika: it must be a valid '
    'address of at most 100 characters'
)


class InvalidCredentials(CodedRefusal):
    status_code = 401

    def __init__(self, message: str = INVALID_CREDENTIALS):
        super().__init__(message)


class EmailUnverified(CodedRefusal):
    status_code = 403
    code = 'email_unverified'

    def __init__(self, message: str = EMAIL_UNVERIFIED):
        super().__init__(message)


class BindingConflict(CodedRefusal):
    status_code = 409
    code = 'binding_conflict'


class EmailAmbiguous(CodedRefusal):
    status_code = 409
    code = 'email_ambiguous'


class EmailUnusable(CodedRefusal):
    """The Borderless email cannot be an applika account email (too long
    for ``users.email`` or refused by ``UserCreateDTO``)."""

    status_code = 422
    code = 'email_unusable'

    def __init__(self, message: str = EMAIL_UNUSABLE):
        super().__init__(message)


class SignInRateLimited(CodedRefusal):
    """Too many sign-in attempts: 429 with ``Retry-After``."""

    status_code = 429

    def __init__(self, retry_after: int):
        retry_after = max(1, int(retry_after))
        super().__init__(
            f'Too many sign-in attempts. Try again in {retry_after} seconds.',
            headers={'Retry-After': str(retry_after)},
        )
        self.retry_after = retry_after


class BadgeRequired(CodedRefusal):
    """The caller has no recorded BASE or PSP badge."""

    status_code = 403
    code = 'badge_required'

    def __init__(self, message: str = BADGE_REQUIRED):
        super().__init__(message)


class MembershipUnconfirmed(CodedRefusal):
    """The caller's recorded badge does not count: the Borderless access
    expired or was refused."""

    status_code = 403
    code = 'membership_unconfirmed'

    def __init__(self, message: str = MEMBERSHIP_UNCONFIRMED):
        super().__init__(message)
