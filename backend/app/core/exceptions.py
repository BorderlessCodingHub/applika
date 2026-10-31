from app.core.error_codes import ErrorCode

type ErrorParams = dict[str, str | int]


class UnicornException(Exception):
    """A domain error the API answers with ``{"detail", "code"}`` (ADR-0025).

    ``code`` is required: every error has its numbered ``ErrorCode``.
    ``params`` is set only when ``message`` names a value (a wait, a count,
    a name); the web fills them into its translated sentence.
    """

    message: str
    code: ErrorCode
    params: ErrorParams | None

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        params: ErrorParams | None = None,
    ):
        self.message = message
        self.code = code
        self.params = params

    def body(self) -> dict[str, object]:
        """The JSON error body: ``detail``, ``code``, then ``params`` only
        when the error carries values."""
        content: dict[str, object] = {
            'detail': self.message,
            'code': self.code.value,
        }
        if self.params is not None:
            content['params'] = self.params
        return content

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

    def __init__(
        self,
        message: str = SESSION_SERVICE_UNAVAILABLE,
        code: ErrorCode = ErrorCode.AUTH_SESSION_SERVICE_UNAVAILABLE,
    ):
        super().__init__(message, code)


class InvalidSession(UnicornException):
    """A refresh value or session that no longer resolves to a live session
    of a live user (KODI-057). ``/auth/refresh`` answers it with 401 and the
    ``refresh_token`` grant of ``POST /auth/token`` with ``invalid_grant``.
    Also every 401 of the signed-in check (``GetCurrentUserUseCase``,
    ``get_current_user``): no token, a bad or expired token, a dead
    session."""


class OAuthError(UnicornException):
    """An RFC 6749 error on ``POST /auth/token`` (KODI-057): 400
    ``{"error": <rfc error>, "detail": <message>, "code": <ErrorCode>}``."""

    def __init__(
        self,
        error: str,
        message: str,
        code: ErrorCode,
        params: ErrorParams | None = None,
    ):
        super().__init__(message, code, params)
        self.error = error


class InvalidRequest(UnicornException):
    """A request the API refuses as malformed in a way the schema cannot
    express (KODI-057: a bad PKCE challenge on ``/auth/cli/authorize``).
    Mapped to 400 ``{"detail": <message>}``."""


class CodedRefusal(UnicornException):
    """A refusal with a fixed status, its ``ErrorCode`` and optional
    headers (ADR-0024, ADR-0025). Mapped to ``{"detail", "code"}`` plus
    ``params`` when set."""

    status_code: int = 400

    def __init__(
        self,
        message: str,
        code: ErrorCode,
        headers: dict[str, str] | None = None,
        params: ErrorParams | None = None,
    ):
        super().__init__(message, code, params)
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
        super().__init__(message, ErrorCode.AUTH_INVALID_CREDENTIALS)


class EmailUnverified(CodedRefusal):
    """Was ``email_unverified`` (ADR-0024); AUTH-1005 since ADR-0025."""

    status_code = 403

    def __init__(self, message: str = EMAIL_UNVERIFIED):
        super().__init__(message, ErrorCode.AUTH_EMAIL_UNVERIFIED)


class BindingConflict(CodedRefusal):
    """Was ``binding_conflict`` (ADR-0024). Sign-in: AUTH-1006; the
    membership confirm passes its own code (AUTH-1010), its message names
    another error."""

    status_code = 409

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.AUTH_BINDING_CONFLICT,
    ):
        super().__init__(message, code)


class EmailAmbiguous(CodedRefusal):
    """Was ``email_ambiguous`` (ADR-0024); AUTH-1007 since ADR-0025."""

    status_code = 409

    def __init__(self, message: str):
        super().__init__(message, ErrorCode.AUTH_EMAIL_AMBIGUOUS)


class EmailUnusable(CodedRefusal):
    """The Borderless email cannot be an applika account email (too long
    for ``users.email`` or refused by ``UserCreateDTO``). Was
    ``email_unusable`` (ADR-0024); AUTH-1008 since ADR-0025."""

    status_code = 422

    def __init__(self, message: str = EMAIL_UNUSABLE):
        super().__init__(message, ErrorCode.AUTH_EMAIL_UNUSABLE)


class SignInRateLimited(CodedRefusal):
    """Too many sign-in attempts: 429 with ``Retry-After``."""

    status_code = 429

    def __init__(self, retry_after: int):
        retry_after = max(1, int(retry_after))
        super().__init__(
            f'Too many sign-in attempts. Try again in {retry_after} seconds.',
            ErrorCode.AUTH_SIGN_IN_RATE_LIMITED,
            headers={'Retry-After': str(retry_after)},
            params={'seconds': retry_after},
        )
        self.retry_after = retry_after


class BadgeRequired(CodedRefusal):
    """The caller has no recorded BASE or PSP badge. Was
    ``badge_required`` (ADR-0024); RPT-1001 since ADR-0025."""

    status_code = 403

    def __init__(self, message: str = BADGE_REQUIRED):
        super().__init__(message, ErrorCode.RPT_BADGE_REQUIRED)


class MembershipUnconfirmed(CodedRefusal):
    """The caller's recorded badge does not count: the Borderless access
    expired or was refused. Was ``membership_unconfirmed`` (ADR-0024);
    RPT-1002 since ADR-0025."""

    status_code = 403

    def __init__(self, message: str = MEMBERSHIP_UNCONFIRMED):
        super().__init__(message, ErrorCode.RPT_MEMBERSHIP_UNCONFIRMED)
