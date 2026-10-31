"""CLI sign-in for ``applika-cli`` 1.1.0 and later (KODI-057, ADR-0019).

- ``GET /auth/cli/authorize``: browser sign-in bound to a PKCE S256
  challenge; GitHub's callback sends the code to the loopback
  ``redirect_uri``, or with ``oob`` to the web page that shows it (R-015,
  R-018).
- ``POST /auth/token``: ``authorization_code``, ``refresh_token`` and
  ``urn:ietf:params:oauth:grant-type:device_code`` (R-015, R-016).
- ``POST /auth/revoke``: ``applika logout`` ends the CLI's own session
  (R-021).
- ``/auth/device/*``: the RFC 8628 device code and its approval by a signed
  in web user (R-016, R-017).

Every CLI session is a session of its own (``client_type='cli'``), listed
with the web ones. Nothing here is behind a beta flag (owner: "Gate
nothing").
"""

from fastapi import APIRouter, Body, Request, Response, status

from app.application.dto.user_session import SessionTokensDTO
from app.application.use_cases.cli_auth.authorize import OOB_REDIRECT_URI
from app.application.use_cases.cli_auth.token import (
    AUTHORIZATION_CODE,
    DEVICE_CODE,
    REFRESH_TOKEN,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import OAuthError
from app.presentation.api import oauth as oauth_api
from app.presentation.api.auth_handoff import validate_cli_callback_url
from app.presentation.dependencies import (
    CliAuthorizeUseCaseDp,
    CliTokenUseCaseDp,
    CurrentUserDp,
    DeviceCodeUseCaseDp,
    EndSessionUseCaseDp,
    client_ip,
    client_user_agent,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.cli_token import (
    DeviceCodeRequest,
    DeviceCodeResponse,
    DeviceVerifyResponse,
    OAuthErrorSchema,
    RevokeRequest,
    TokenRequest,
    TokenResponse,
    UserCodeRequest,
)

router = APIRouter(prefix='/auth', tags=['CLI sign-in'])


def _token_response(tokens: SessionTokensDTO) -> TokenResponse:
    return TokenResponse(
        access_token=tokens.access_token,
        expires_in=tokens.access_expires_in,
        refresh_token=tokens.refresh_token,
        refresh_expires_in=tokens.refresh_expires_in,
    )


@router.get(
    '/cli/authorize',
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    responses={400: {'model': DetailSchema}},
)
async def cli_authorize(
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str,
    state: str,
    use_case: CliAuthorizeUseCaseDp,
):
    """307 to applika's Borderless sign-in page (``WEB_SIGNIN_URI?cli=1``)
    with the ``__cli_login`` marker cookie."""
    if redirect_uri != OOB_REDIRECT_URI:
        validate_cli_callback_url(redirect_uri)
    login_id = await use_case.execute(
        redirect_uri, code_challenge, code_challenge_method, state
    )
    return oauth_api.redirect_to_signin_for_cli(
        login_id, use_case.handoff_state.login_ttl_seconds
    )


@router.post(
    '/token',
    response_model=TokenResponse,
    responses={
        400: {'model': OAuthErrorSchema},
        503: {'model': DetailSchema},
    },
)
async def token(
    payload: TokenRequest,
    request: Request,
    use_case: CliTokenUseCaseDp,
):
    if payload.grant_type == AUTHORIZATION_CODE:
        tokens = await use_case.authorization_code(
            code=payload.code or '',
            code_verifier=payload.code_verifier or '',
            redirect_uri=payload.redirect_uri or '',
            device_name=payload.device_name,
            user_agent=client_user_agent(request),
            ip=client_ip(request),
        )
    elif payload.grant_type == REFRESH_TOKEN:
        tokens = await use_case.refresh_token(payload.refresh_token or '')
    elif payload.grant_type == DEVICE_CODE:
        tokens = await use_case.device_code(payload.device_code or '')
    else:
        raise OAuthError(
            'unsupported_grant_type',
            f'Unsupported grant_type: {payload.grant_type[:50]}',
            ErrorCode.AUTH_UNSUPPORTED_GRANT_TYPE,
            params={'grant_type': payload.grant_type[:50]},
        )
    return _token_response(tokens)


@router.post(
    '/revoke',
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def revoke(payload: RevokeRequest, use_case: EndSessionUseCaseDp):
    """RFC 7009: 204 whether or not the value named a live session."""
    await use_case.end_by_refresh(payload.refresh_token, 'logout')
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post('/device/code', response_model=DeviceCodeResponse)
async def device_code(
    request: Request,
    use_case: DeviceCodeUseCaseDp,
    payload: DeviceCodeRequest | None = Body(default=None),
):
    started = await use_case.start(
        device_name=payload.device_name if payload else None,
        user_agent=client_user_agent(request),
        ip=client_ip(request),
    )
    return DeviceCodeResponse.model_validate(started.model_dump())


@router.get(
    '/device/verify',
    response_model=DeviceVerifyResponse,
    responses={404: {'model': DetailSchema}},
)
async def device_verify(
    user_code: str,
    c_user: CurrentUserDp,
    use_case: DeviceCodeUseCaseDp,
):
    """What the approval page shows: device name, IP and request time."""
    requested = await use_case.verify(user_code)
    return DeviceVerifyResponse.model_validate(requested.model_dump())


@router.post(
    '/device/approve',
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={404: {'model': DetailSchema}, 409: {'model': DetailSchema}},
)
async def device_approve(
    payload: UserCodeRequest,
    c_user: CurrentUserDp,
    use_case: DeviceCodeUseCaseDp,
):
    await use_case.approve(payload.user_code, c_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    '/device/deny',
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={404: {'model': DetailSchema}, 409: {'model': DetailSchema}},
)
async def device_deny(
    payload: UserCodeRequest,
    c_user: CurrentUserDp,
    use_case: DeviceCodeUseCaseDp,
):
    await use_case.deny(payload.user_code, c_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
