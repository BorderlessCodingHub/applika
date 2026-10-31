"""Shared ownership and read-only guards for the application CV copy.

The editability check is the timeline's own guard, because the criterion
asks for the CV copy to be refused "matching how steps are refused today".
Create, update and delete all go through here; only the read path skips the
editability guard, because viewing a closed or archived application's copy
stays allowed.
"""

from app.application.use_cases.applications.guards import ensure_mutable
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.models import ApplicationModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


async def load_owned_application(
    application_repo: ApplicationRepository,
    application_id: int,
    user_id: int,
) -> ApplicationModel:
    """Load an application the acting user owns, or raise ``ResourceNotFound``.

    This is the authorization boundary for every CV-copy route. Nothing in the
    schema ties ``tailored_cvs.user_id`` to ``applications.user_id``, so
    authorizing against the copy's own ``user_id`` alone would leave a hole:
    the *application's* owner is what decides access. Another user's
    application is indistinguishable from one that does not exist
    (docs/adr/0004-row-ownership-and-is-admin.md), and being an admin
    grants nothing.

    ``include_drafts=True`` (KODI-032): the CV-copy routes are also how a
    "new application with CV" draft's copy is created, read, edited and
    deleted (PRD 0007's page reused for step 2, ADR-0014), so this is the
    one caller that must see a draft - every other read path excludes it
    (``application_filters.NOT_DRAFT``).
    """
    application = await application_repo.get_by_id_and_user_id(
        application_id, user_id, include_drafts=True
    )
    if not application:
        raise ResourceNotFound(
            'Application not found or not owned by user',
            ErrorCode.APP_APPLICATION_NOT_FOUND,
        )
    return application


def ensure_application_is_editable(application: ApplicationModel) -> None:
    """Refuse writes to an archived or closed application.

    The CV copy is refused exactly as a timeline event (and a /steps write)
    is, because PRD 0007 asks for the refusal to match the steps': this *is*
    the steps' guard, ``ensure_mutable``. Archived in a cycle is a
    business-rule violation (422), closed (``finalized_at`` set, reversible
    since PRD 0008) a conflict (409) that says to reopen it. PRD 0007's
    codes are unchanged.
    """
    ensure_mutable(application)
