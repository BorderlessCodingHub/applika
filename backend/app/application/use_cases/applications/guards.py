"""Write guards for the applications aggregate (R-010, R-011).

Two lifecycle locks protect a write, checked in this order:

* **Archived** (``cycle_id`` set): the only *permanent* lock. A cycle is an
  archived snapshot and its applications are frozen for good.
* **Closed** (``finalized_at`` set): a *reversible* soft lock. Editing a
  closed application is refused until it is reopened (R-008).

The two locks answer different codes (PRD 0008 "Assumptions"): the archived
lock keeps applika's ``BusinessRuleViolation`` (422) and message, "as it does
today", and the closed lock is ``ApplicationFinalized`` (409), so installed
CLIs and the CV-copy routes (PRD 0007) see the codes they always saw. The
closed message tells the user what to do.
"""

from typing import Protocol

from app.core.exceptions import ApplicationFinalized, BusinessRuleViolation

ARCHIVED_MESSAGE = 'Cannot modify an application from an archived cycle'
CLOSED_MESSAGE = 'Reopen the application to edit it (it is currently closed)'


class _Lifecycle(Protocol):
    @property
    def cycle_id(self) -> int | None: ...

    @property
    def finalized_at(self) -> object | None: ...


def ensure_mutable(application: _Lifecycle) -> None:
    """Refuse a write on a locked application.

    Archived first (``BusinessRuleViolation``, 422), then closed
    (``ApplicationFinalized``, 409, "Reopen the application to edit it").
    An application that is both is reported as archived: reopening it would
    not help.
    """
    if application.cycle_id is not None:
        raise BusinessRuleViolation(ARCHIVED_MESSAGE)
    if application.finalized_at is not None:
        raise ApplicationFinalized(CLOSED_MESSAGE)


def ensure_not_archived(application: _Lifecycle) -> None:
    """Refuse a lifecycle transition on an archived application.

    Finalize and reopen are the exception to :func:`ensure_mutable`: they
    must work on a *closed* application (that is the point of reopen), so
    they skip the closed lock. Only the archived lock still blocks them.
    """
    if application.cycle_id is not None:
        raise BusinessRuleViolation(ARCHIVED_MESSAGE)
