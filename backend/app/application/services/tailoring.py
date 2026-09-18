"""The CV tailoring port - provider-agnostic, framework-free.

One application-layer port describing "tailor a master CV to a job posting",
with no HTTP, no framework and no provider imports. A ``Protocol`` rather than
an ABC: it matches the duck-typed style of ``application/services/`` and lets a
test supply a fake without inheriting anything.

The owner's words: "In the future i want to connect this to real models, but
this is to the future." That future is the only reason this port exists. Today
there is exactly one binding, ``CloneTailoringService``, and it copies the
master CV verbatim. Because the port's output is the full stored CV shape
(``TailoredCVContent``), a model-backed binding can replace the clone later
without changing a single stored field or touching the API.

The method is ``async`` even though the clone does no I/O at all: the whole
codebase is async, and a binding that really calls a model must not need a
signature change to do it.
"""

from typing import Protocol

from app.application.dto.tailored_cv import TailoringRequest, TailoringResult


class TailoringService(Protocol):
    """Tailor a master CV to an application's job description.

    Contract: given the source master CV and the application's
    ``job_description``, return the full tailored content, a list of
    adjustments and the ``was_ai_generated`` provenance flag. A binding only
    ever *reads* the master CV - it never writes to it.
    """

    async def tailor(self, request: TailoringRequest) -> TailoringResult: ...
