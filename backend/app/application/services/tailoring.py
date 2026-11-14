"""The CV tailoring port - provider-agnostic, framework-free.

One application-layer port describing "tailor a master CV to a job posting",
with no HTTP, no framework and no provider imports. A ``Protocol`` rather than
an ABC: it matches the duck-typed style of ``application/services/`` and lets a
test supply a fake without inheriting anything.

The owner's words: "In the future i want to connect this to real models, but
this is to the future." Today there are two bindings (ADR-0017, amending
ADR-0007), both deterministic and model-free:

* ``CloneTailoringService`` copies the master CV verbatim. It is the default
  everywhere, and the only one an installed ``applika-cli`` ever gets.
* ``KeywordTailoringService`` makes the same copy, then only reorders skill
  keywords, skill categories and experience bullets by job match.

The binding is chosen per request by a :data:`TailoringResolver`, keyed by
the request's ``tailoring`` value. Because the port's output is the full
stored CV shape (``TailoredCVContent``), a model-backed binding can be added
later without changing a single stored field.

The method is ``async`` even though the clone does no I/O at all: the whole
codebase is async, and a binding that really calls a model must not need a
signature change to do it.
"""

from collections.abc import Callable
from typing import Protocol

from app.application.dto.tailored_cv import (
    TailoringMode,
    TailoringRequest,
    TailoringResult,
)


class TailoringService(Protocol):
    """Tailor a master CV to an application's job description.

    Contract: given the source master CV and the application's
    ``job_description``, return the full tailored content, a list of
    adjustments and the ``was_ai_generated`` provenance flag. A binding only
    ever *reads* the master CV - it never writes to it.
    """

    async def tailor(self, request: TailoringRequest) -> TailoringResult: ...


# Picks the binding for one request: ``'copy'`` -> the clone,
# ``'keywords'`` -> the keyword binding. Wired in
# ``app/presentation/dependencies.py`` (``get_tailoring_resolver``).
type TailoringResolver = Callable[[TailoringMode], TailoringService]
