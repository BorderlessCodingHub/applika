"""Start the one-shot GitHub data restore (ADR-0024). Not behind a beta
gate (ADR-0024 §9)."""

from fastapi import APIRouter

from app.presentation.dependencies import (
    BeginGithubRestoreUseCaseDp,
    CurrentUserDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.account_link import AccountLinkStart

router = APIRouter(prefix='/auth/github', tags=['GitHub restore'])


@router.post(
    '/restore',
    response_model=AccountLinkStart,
    responses={
        '401': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '503': {'model': DetailSchema},
    },
)
async def begin_github_restore(
    c_user: CurrentUserDp, use_case: BeginGithubRestoreUseCaseDp
):
    """The GitHub consent URL (scope ``read:user``). Answered only to an
    account with no GitHub identity on record; marks the welcome prompt
    seen."""
    return AccountLinkStart(authorize_url=await use_case.execute(c_user.id))
