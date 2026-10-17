"""The caller's devices (KODI-057, ADR-0019, R-010..R-014).

Every user has these routes at release: the owner chose "Gate nothing"
(ADR-0019, the exception to ADR-0018), so no beta gate sits
here. Another user's session is a 404, admins included (ADR-0004).
"""

from fastapi import APIRouter, Response, status

from app.core.tokens import clear_access_cookie, clear_refresh_cookie
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CurrentSessionIdDp,
    CurrentUserDp,
    EndSessionUseCaseDp,
    ListMySessionsUseCaseDp,
    RevokeOtherSessionsUseCaseDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.user_sessions import (
    RevokeOthersOut,
    UserSessionOut,
)

router = APIRouter(prefix='/users/me/sessions', tags=['Devices'])


@router.get('', response_model=list[UserSessionOut])
async def list_my_sessions(
    c_user: CurrentUserDp,
    current_session_id: CurrentSessionIdDp,
    use_case: ListMySessionsUseCaseDp,
):
    """Active devices by last use, then ended ones within
    ``SESSION_HISTORY_DAYS``. ``current`` marks "This device". Writes
    nothing."""
    items = await use_case.execute(c_user.id, current_session_id)
    return [UserSessionOut.model_validate(item.model_dump()) for item in items]


@router.post('/revoke-others', response_model=RevokeOthersOut)
async def revoke_other_sessions(
    c_user: CurrentUserDp,
    current_session_id: CurrentSessionIdDp,
    use_case: RevokeOtherSessionsUseCaseDp,
):
    """Sign out every other device in one action."""
    revoked = await use_case.execute(c_user.id, current_session_id)
    return RevokeOthersOut(revoked=revoked)


@router.delete(
    '/{session_id}',
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={404: {'model': DetailSchema}},
)
async def revoke_session(
    session_id: SnowflakeID,
    c_user: CurrentUserDp,
    current_session_id: CurrentSessionIdDp,
    use_case: EndSessionUseCaseDp,
):
    """Revoke one own device. An ended or expired one is a no-op 204.
    Revoking "This device" also clears both cookies."""
    await use_case.execute(c_user.id, session_id, 'revoked')
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if session_id == current_session_id:
        clear_access_cookie(response)
        clear_refresh_cookie(response)
    return response
