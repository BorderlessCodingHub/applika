"""Sign in with Borderless through OpenID Connect (ADR-0026 §2, §3, §11).

- ``GET /auth/borderless/login``: 307 to Borderless's authorize endpoint
  for a web sign-in (no ``prompt``: the Borderless browser session is
  reused), with the ``__applika_login`` cookie that binds the attempt to
  this browser.
- ``GET /auth/borderless/callback``: Borderless's return, always a 307, to
  the target the attempt stored in Redis at its start once it is checked
  again against the allowed ones: ``WEB_SIGNIN_URI`` with a new web
  session, or the CLI's loopback or manual-code page
  (``cli_handoff_redirect``, no cookie); a refusal goes to
  ``WEB_SIGNIN_URI?error=<code>`` (``&cli=1`` for a CLI sign-in). The
  attempt cookie is cleared on every answer but AUTH-1046 (no attempt
  matched: the cookie may be a newer attempt's, in another tab).

Applika never sees a Borderless password, and no Borderless token, code or
state reaches a response body, the browser or a log; the request log
redacts the callback's query (``config/middleware.py``). No query value
decides where the browser goes. Not behind a beta gate (ADR-0024 §9).
"""

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import RedirectResponse

from app.application.use_cases.borderless.complete_login import (
    BorderlessLoginFailed,
)
from app.application.use_cases.borderless.login_target import (
    CLI_LOGIN_EXPIRED,
)
from app.config.logging import logger
from app.config.settings import REFRESH_COOKIE_NAME, envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import CodedRefusal, ServiceUnavailable
from app.presentation.api.auth_handoff import (
    LOGIN_COOKIE_NAME,
    attempt_redirect,
    clear_login_cookie,
    signin_redirect,
)
from app.presentation.api.oauth import (
    cli_handoff_redirect,
    set_session_cookies,
)
from app.presentation.dependencies import (
    AuthHandoffStateUseCaseDp,
    BeginBorderlessLoginUseCaseDp,
    CompleteBorderlessLoginUseCaseDp,
    EndSessionUseCaseDp,
    OpenSessionUseCaseDp,
    client_ip,
    client_user_agent,
)
from app.presentation.no_input_echo import NoInputEchoRoute

router = APIRouter(
    prefix='/auth/borderless',
    tags=['Borderless'],
    route_class=NoInputEchoRoute,
)


def _cli_login_expired() -> RedirectResponse:
    logger.info(f'Borderless CLI sign-in refused ({CLI_LOGIN_EXPIRED})')
    return signin_redirect(ErrorCode.AUTH_CLI_LOGIN_EXPIRED, cli=True)


def _unexpected(where: str, exc: BaseException) -> None:
    # The type only: never the query, a code or a token.
    logger.error(f'Borderless {where} failed ({type(exc).__name__})')


@router.get('/login', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def borderless_login(begin: BeginBorderlessLoginUseCaseDp):
    """Start a web sign-in: 307 to Borderless's authorize endpoint, or to
    the sign-in page with AUTH-1018 (not configured) or AUTH-1017
    (Borderless unavailable)."""
    try:
        authorize_url, binding = await begin.execute('web')
    except (CodedRefusal, ServiceUnavailable) as exc:
        return signin_redirect(exc.code)
    except Exception as exc:
        _unexpected('sign-in start', exc)
        return signin_redirect(ErrorCode.GEN_INTERNAL_ERROR)
    return attempt_redirect(authorize_url, binding)


@router.get('/callback', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def borderless_callback(
    request: Request,
    complete: CompleteBorderlessLoginUseCaseDp,
    handoff_state: AuthHandoffStateUseCaseDp,
    open_session: OpenSessionUseCaseDp,
    end_session: EndSessionUseCaseDp,
):
    """Borderless's return (``code``, ``state``, ``iss``, or ``error``).
    Web: this browser's earlier session ends ``replaced``, a ``borderless``
    session opens, both cookies are set. CLI: the code goes back to the CLI
    and the browser's own session is untouched."""
    params = {key: value for key, value in request.query_params.items()}
    response: Response
    try:
        outcome = await complete.execute(
            params, request.cookies.get(LOGIN_COOKIE_NAME)
        )
    except BorderlessLoginFailed as failed:
        if failed.unexpected and failed.__cause__ is not None:
            _unexpected('callback', failed.__cause__)
        response = signin_redirect(failed.code, cli=failed.flow == 'cli')
        # No attempt matched this return: the cookie may belong to a newer
        # attempt in this browser (two tabs), which must still complete.
        if failed.code != ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED:
            clear_login_cookie(response)
        return response

    try:
        if outcome.flow == 'cli':
            target = (
                await cli_handoff_redirect(
                    outcome.cli_login_id,
                    handoff_state,
                    user_id=outcome.user_id,
                    target=outcome.target,
                )
                if outcome.cli_login_id
                else None
            )
            response = (
                RedirectResponse(
                    target, status_code=status.HTTP_307_TEMPORARY_REDIRECT
                )
                if target
                else _cli_login_expired()
            )
        elif outcome.target != envs.WEB_SIGNIN_URI:
            # The use case checked it already: a web sign-in ends on the
            # web sign-in page and nowhere else.
            response = signin_redirect(ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED)
        else:
            await end_session.end_by_refresh(
                request.cookies.get(REFRESH_COOKIE_NAME),
                'replaced',
                user_id=outcome.user_id,
            )
            tokens = await open_session.execute(
                user_id=outcome.user_id,
                client_type='web',
                sign_in_method='borderless',
                user_agent=client_user_agent(request),
                ip=client_ip(request),
            )
            response = RedirectResponse(
                outcome.target, status_code=status.HTTP_307_TEMPORARY_REDIRECT
            )
            set_session_cookies(tokens, response)
    except ServiceUnavailable as exc:
        response = signin_redirect(exc.code, cli=outcome.flow == 'cli')
    except Exception as exc:
        _unexpected('callback', exc)
        response = signin_redirect(
            ErrorCode.GEN_INTERNAL_ERROR, cli=outcome.flow == 'cli'
        )
    clear_login_cookie(response)
    return response
