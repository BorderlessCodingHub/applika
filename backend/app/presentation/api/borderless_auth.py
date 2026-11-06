"""Borderless sign-in and membership confirmation (ADR-0024).

Not behind a beta gate (ADR-0024 §9). The password goes to Borderless
from the server only; no Borderless token ever reaches the browser or the
CLI.
"""

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse

from app.config.settings import REFRESH_COOKIE_NAME
from app.presentation.api.auth_handoff import CLI_LOGIN_COOKIE_NAME
from app.presentation.api.oauth import (
    cli_handoff_redirect,
    set_session_cookies,
)
from app.presentation.dependencies import (
    AuthHandoffStateUseCaseDp,
    BorderlessSignInUseCaseDp,
    ConfirmMembershipUseCaseDp,
    CurrentUserDp,
    EndSessionUseCaseDp,
    OpenSessionUseCaseDp,
    client_ip,
    client_user_agent,
)
from app.presentation.no_input_echo import NoInputEchoRoute
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.borderless_auth import (
    BorderlessCredentials,
    BorderlessSignInResponse,
    CodedDetailSchema,
)

router = APIRouter(
    prefix='/auth/borderless',
    tags=['Borderless'],
    route_class=NoInputEchoRoute,
)

_REFUSALS: dict[int | str, dict] = {
    '401': {'model': DetailSchema},
    '403': {'model': CodedDetailSchema},
    '409': {'model': CodedDetailSchema},
    '429': {'model': DetailSchema},
    '503': {'model': DetailSchema},
}


@router.post(
    '/signin', response_model=BorderlessSignInResponse, responses=_REFUSALS
)
async def borderless_sign_in(
    payload: BorderlessCredentials,
    request: Request,
    sign_in: BorderlessSignInUseCaseDp,
    handoff_state: AuthHandoffStateUseCaseDp,
    open_session: OpenSessionUseCaseDp,
    end_session: EndSessionUseCaseDp,
):
    """Sign in with a Borderless email and password.

    Web: ends this browser's earlier session as ``replaced``, opens a
    ``borderless`` session and sets ``__access`` and ``__refresh``. With the
    ``__cli_login`` marker: no cookie and the browser's own session is
    untouched; ``redirect_to`` hands the sign-in back to the CLI.
    """
    result = await sign_in.execute(payload.email, payload.password)

    login_id = request.cookies.get(CLI_LOGIN_COOKIE_NAME)
    if login_id:
        redirect_to = await cli_handoff_redirect(
            login_id, handoff_state, user_id=result.user_id
        )
        if redirect_to is None:
            expired = JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={'detail': 'CLI login expired'},
            )
            expired.delete_cookie(CLI_LOGIN_COOKIE_NAME)
            return expired
        response = JSONResponse(
            content=BorderlessSignInResponse(
                redirect_to=redirect_to, new_account=result.new_account
            ).model_dump()
        )
        response.delete_cookie(CLI_LOGIN_COOKIE_NAME)
        return response

    await end_session.end_by_refresh(
        request.cookies.get(REFRESH_COOKIE_NAME),
        'replaced',
        user_id=result.user_id,
    )
    tokens = await open_session.execute(
        user_id=result.user_id,
        client_type='web',
        sign_in_method='borderless',
        user_agent=client_user_agent(request),
        ip=client_ip(request),
    )
    response = JSONResponse(
        content=BorderlessSignInResponse(
            redirect_to=None, new_account=result.new_account
        ).model_dump()
    )
    set_session_cookies(tokens, response)
    return response


@router.post(
    '/confirm',
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=_REFUSALS,
)
async def confirm_membership(
    payload: BorderlessCredentials,
    c_user: CurrentUserDp,
    use_case: ConfirmMembershipUseCaseDp,
):
    """Renew the Borderless access and read the membership for the
    signed-in user. The current session and its cookies are untouched."""
    await use_case.execute(c_user.id, payload.email, payload.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
