"""Discord account-link OAuth service (KODI-020, ADR 0008).

Connecting Discord from the profile is a separate, optional flow from GitHub
login: it never creates or changes an Applika session, it only reads the
Discord user id and discards everything else.

T013 decision (checked against the installed ``fastapi_sso`` 0.21.0, package
pinned ``>=0.18.0``, source at
``.venv/lib/python3.14/site-packages/fastapi_sso/sso/{base,discord}.py``):
this service does **not** use ``fastapi_sso.sso.discord.DiscordSSO``.

``SSOBase.get_login_redirect()`` sets an ``sso_state`` cookie on the redirect
response whenever a ``state`` value is passed to it, and
``verify_and_process()`` is built to read that cookie back on the callback
(``requires_state`` is ``False`` for ``DiscordSSO``, but the state-cookie
round trip is still the library's only supported way to carry a caller-chosen
``state`` through the flow safely). Our own Redis nonce
(``AccountLinkStateUseCase``) is already the CSRF check for this flow, so a
second, library-owned state cookie is redundant, and the contract
(``GET /auth/link/discord/callback`` "sets and clears no cookie", R-001) would
be broken by it outright. Building the authorize URL and doing the code
exchange with plain ``httpx`` keeps the callback cookie-free and keeps the
whole request shape (a nonce, not a ``Request`` object) obvious at the call
site.

No Discord token is ever stored, returned or logged: ``fetch_discord_id``
keeps the access token in a local variable only, and revokes it before
returning.
"""

from urllib.parse import urlencode

import httpx

from app.config.logging import logger
from app.config.settings import envs

_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
_TOKEN_URL = 'https://discord.com/api/oauth2/token'
_REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke'
_USERINFO_URL = 'https://discord.com/api/users/@me'

SCOPE = 'identify'


class DiscordLinkError(Exception):
    """The Discord consent could not be turned into a Discord user id.

    Raised on a refused code exchange, a network failure or a userinfo
    response missing an id - never carries the token or the code (T037,
    T038).
    """


class DiscordOAuthService:
    def __init__(self) -> None:
        self.client_id = envs.DISCORD_CLIENT_ID
        self.client_secret = envs.DISCORD_CLIENT_SECRET
        self.redirect_uri = envs.DISCORD_LINK_REDIRECT_URI

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def get_authorize_url(self, state: str) -> str:
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'scope': SCOPE,
            'state': state,
        }
        return f'{_AUTHORIZE_URL}?{urlencode(params)}'

    async def fetch_discord_id(self, code: str) -> int:
        """Exchange ``code`` for an access token, read the Discord user id,
        then revoke the token. The token never leaves this method's local
        scope: never logged, never returned, never stored."""
        try:
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    _TOKEN_URL,
                    data={
                        'grant_type': 'authorization_code',
                        'code': code,
                        'redirect_uri': self.redirect_uri,
                        'client_id': self.client_id,
                        'client_secret': self.client_secret,
                    },
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout=5,
                )
                if token_response.status_code >= 400:
                    logger.warning(
                        'Discord token exchange refused',
                        extra={
                            'extra_data': {
                                'event': 'discord_link_failed',
                                'reason': 'token_exchange_refused',
                                'status_code': token_response.status_code,
                            }
                        },
                    )
                    raise DiscordLinkError('Discord token exchange refused')

                access_token = token_response.json().get('access_token')
                if not access_token:
                    raise DiscordLinkError(
                        'Discord token response carried no access token'
                    )

                user_response = await client.get(
                    _USERINFO_URL,
                    headers={'Authorization': f'Bearer {access_token}'},
                    timeout=5,
                )
                if user_response.status_code >= 400:
                    logger.warning(
                        'Discord userinfo request refused',
                        extra={
                            'extra_data': {
                                'event': 'discord_link_failed',
                                'reason': 'userinfo_refused',
                                'status_code': user_response.status_code,
                            }
                        },
                    )
                    raise DiscordLinkError('Discord userinfo request refused')

                discord_id = user_response.json().get('id')
                if not discord_id:
                    raise DiscordLinkError(
                        'Discord userinfo response carried no id'
                    )

                await self.revoke_token(access_token)
                return int(discord_id)
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord link failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_link_failed',
                        'reason': 'network_error',
                    }
                },
            )
            raise DiscordLinkError('Discord was unreachable') from exc

    async def revoke_token(self, token: str) -> None:
        """Best-effort revoke, right after the id is read (R-004). A Discord
        failure here never blocks the connection: swallowed and logged
        without the token value."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    _REVOKE_URL,
                    data={
                        'token': token,
                        'token_type_hint': 'access_token',
                        'client_id': self.client_id,
                        'client_secret': self.client_secret,
                    },
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout=5,
                )
                if response.status_code >= 300:
                    logger.warning(
                        'Discord token revoke failed',
                        extra={
                            'extra_data': {
                                'event': 'discord_revoke_failed',
                                'status_code': response.status_code,
                            }
                        },
                    )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord token revoke failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_revoke_failed',
                    }
                },
            )
