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
