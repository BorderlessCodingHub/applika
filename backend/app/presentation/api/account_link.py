"""Discord account link: connect, conflict, disconnect, failed consent.

Keeps GitHub as the only way to sign in (R-001): the callback never sets or
clears a session cookie, it only writes the already signed-in user's own
Discord connection row. See
``app/application/services/discord_oauth_service.py`` for the T013 decision
on why this does not use ``fastapi_sso``.
"""

from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.application.services.discord_oauth_service import DiscordLinkError
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.logging import logger
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.exceptions import ResourceConflict, SessionServiceUnavailable
from app.presentation.dependencies import (
    AccountLinkStateUseCaseDp,
    CurrentUserDp,
    DiscordOAuthServiceDp,
    LinkDiscordUseCaseDp,
    SessionStoreDp,
    UnlinkDiscordUseCaseDp,
    UserRepositoryDp,
    client_ip,
)
from app.presentation.schemas.account_link import (
    AccountLinkOut,
    AccountLinkStart,
)

router = APIRouter(prefix='/auth', tags=['Account links'])


def _redirect(status: str) -> RedirectResponse:
    query = urlencode({'account': 'discord', 'status': status})
    return RedirectResponse(f'{envs.ACCOUNT_LINK_REDIRECT_URI}?{query}')


@router.post('/link/discord', response_model=AccountLinkStart)
async def begin_discord_link(
    c_user: CurrentUserDp,
    discord_service: DiscordOAuthServiceDp,
    state_use_case: AccountLinkStateUseCaseDp,
):
    if not discord_service.is_configured():
        raise HTTPException(
            status_code=503, detail='Discord linking is not configured'
        )

    nonce = await state_use_case.create(c_user.id)
    return AccountLinkStart(
        authorize_url=discord_service.get_authorize_url(nonce)
    )


@router.get('/link/discord/callback')
async def discord_link_callback(
    request: Request,
    user_repo: UserRepositoryDp,
    session_store: SessionStoreDp,
    discord_service: DiscordOAuthServiceDp,
    state_use_case: AccountLinkStateUseCaseDp,
    link_discord_use_case: LinkDiscordUseCaseDp,
):
    """Never returns JSON, and never sets or clears a cookie (R-001, R-007).

    Order (T017/T037, unchanged by KODI-024): consume the nonce first (so a
    replay never matches again, even on a Discord-side error), then resolve
    the caller's own session, then require the two to agree on the user,
    then talk to Discord - now an ``exchange_code`` + ``fetch_profile`` pair
    instead of the old ``fetch_discord_id``.

    Reopened 2026-09-24 (R-008 rewrite): a Discord id already held by
    another user is a *transfer*, not a conflict - the link use case moves
    it and this still answers ``linked``. ``ResourceConflict`` now only
    happens on a genuine two-user race (both completing consent for the
    same Discord account at the same instant); the loser gets ``conflict``.
    """
    state = request.query_params.get('state')
    nonce_user_id = await state_use_case.consume(state) if state else None
    if nonce_user_id is None:
        logger.info(
            'Discord link callback: unknown, expired or replayed state',
            extra={'extra_data': {'event': 'discord_link_failed'}},
        )
        return _redirect('error')

    if request.query_params.get('error') or not request.query_params.get(
        'code'
    ):
        logger.info(
            'Discord link callback: consent refused or no code',
            extra={'extra_data': {'event': 'discord_link_failed'}},
        )
        return _redirect('error')

    access_token = request.cookies.get(ACCESS_COOKIE_NAME)
    try:
        authenticated = await GetCurrentUserUseCase(
            user_repo, session_store
        ).execute(access_token, client_ip(request))
    except HTTPException, SessionServiceUnavailable:
        # KODI-057: the cookie's session is checked like on any signed-in
        # request; a revoked session, or a session service that cannot be
        # reached, is the same error redirect (fail closed).
        logger.info(
            'Discord link callback: missing or expired session',
            extra={'extra_data': {'event': 'discord_link_failed'}},
        )
        return _redirect('error')
    current_user = authenticated.user

    if current_user.id != nonce_user_id:
        logger.info(
            'Discord link callback: session user does not match the '
            'user who started the link',
            extra={'extra_data': {'event': 'discord_link_failed'}},
        )
        return _redirect('error')

    if not discord_service.is_configured():
        logger.info(
            'Discord link callback: Discord app not configured',
            extra={'extra_data': {'event': 'discord_link_failed'}},
        )
        return _redirect('error')

    code = request.query_params['code']
    try:
        grant = await discord_service.exchange_code(code)
        profile = await discord_service.fetch_profile(grant.access_token)
    except DiscordLinkError:
        logger.info(
            'Discord link callback: exchange or profile fetch failed',
            extra={'extra_data': {'event': 'discord_link_failed'}},
        )
        return _redirect('error')

    try:
        await link_discord_use_case.execute(current_user.id, grant, profile)
    except ResourceConflict:
        # Only a lost two-user race reaches here now (R-008): a Discord id
        # already held by a single other user is transferred, not refused.
        return _redirect('conflict')

    return _redirect('linked')


@router.delete('/link/discord', response_model=AccountLinkOut)
async def disconnect_discord(
    c_user: CurrentUserDp,
    unlink_discord_use_case: UnlinkDiscordUseCaseDp,
):
    """Idempotent. Deletes the connection row and asks Discord to revoke the
    stored grant, best-effort - a Discord failure never blocks the
    disconnect (R-009)."""
    await unlink_discord_use_case.execute(c_user.id)
    return AccountLinkOut(provider='discord', linked=False)
