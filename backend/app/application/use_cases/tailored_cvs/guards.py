"""Shared ownership and read-only guards for the application CV copy.

Both checks are deliberately identical to the ones
``CreateApplicationStepUseCase`` has always applied - same order, same
exception types, same messages - because the criterion asks for the CV copy to
be refused "matching how steps are refused today". Create, update and delete
all go through here; only the read path skips the editability guard, because
viewing a finalized or archived application's copy stays allowed.
"""

from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    ResourceNotFound,
)
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
    (docs/applika/adr/0004-row-ownership-and-is-admin.md), and being an admin
    grants nothing.
    """
    application = await application_repo.get_by_id_and_user_id(
        application_id, user_id
    )
    if not application:
        raise ResourceNotFound('Application not found or not owned by user')
    return application


def ensure_application_is_editable(application: ApplicationModel) -> None:
    """Refuse writes to an archived or finalized application.

    Verbatim from ``CreateApplicationStepUseCase``, order included: an
    application archived in a cycle is a business-rule violation (422) and a
    finalized one is a conflict (409).
    """
    if application.cycle_id is not None:
        raise BusinessRuleViolation(
            'Cannot modify an application from an archived cycle'
        )
    if application.feedback_id is not None:
        raise ApplicationFinalized(
            'This application has already been finalized'
        )
