"""Shared read filter that keeps drafts out of every read model
(ADR-0014, KODI-032).

A draft ("new application with CV" in progress) is a real ``applications``
row with ``is_draft = true``. It must never surface through the ordinary
application read paths - the list, statistics, reports, cycles, the agenda
or admin counts - only through the dedicated ``/applications/drafts``
routes and the CV-copy routes (``tailored_cvs/guards.load_owned_application``
passes ``include_drafts=True``, the one caller that needs to see it).

Import this constant instead of writing ``ApplicationModel.is_draft.is_(False)``
inline, so every read path applies exactly the same condition.
"""

from app.domain.models import ApplicationModel

NOT_DRAFT = ApplicationModel.is_draft.is_(False)
