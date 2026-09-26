"""Discord account-link OAuth service (KODI-024, ADR-0013, supersedes
ADR-0008/KODI-020).

Connecting Discord from the profile is a separate, optional flow from GitHub
login: it never creates or changes an Applika session.

T013 decision (kept from KODI-020, still checked against the installed
``fastapi_sso`` 0.21.0): this service does not use
``fastapi_sso.sso.discord.DiscordSSO``, because that library sets its own
``sso_state`` cookie whenever a caller-chosen ``state`` is passed to it,
which would break the callback's "sets no cookie" contract (R-001). Our own
Redis nonce (``AccountLinkStateUseCase``) is already the CSRF check for this
flow, so plain ``httpx`` keeps the callback cookie-free.

KODI-024 replaces the old identity-only, revoke-at-connect flow: the scope
now also asks for ``guilds`` and ``guilds.members.read`` (R-014), the
connection keeps a refresh token (encrypted) instead of revoking the grant
immediately, and ``refresh()``/``revoke()`` are new. No Discord token is ever
logged: every method keeps the access/refresh token values out of its log
calls and out of ``repr()`` (``DiscordGrant``'s two token fields are declared
``repr=False``).
"""

from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx

from app.config.logging import logger
from app.config.settings import envs

_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
_TOKEN_URL = 'https://discord.com/api/oauth2/token'
_REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke'
_USERINFO_URL = 'https://discord.com/api/users/@me'
_GUILDS_URL = 'https://discord.com/api/users/@me/guilds'


def _member_url(guild_id: int) -> str:
    return f'https://discord.com/api/users/@me/guilds/{guild_id}/member'


SCOPE = 'identify guilds guilds.members.read'

_TIMEOUT_SECONDS = 5


class DiscordLinkError(Exception):
    """The Discord consent could not be turned into a grant/profile.

    Raised on a refused code exchange, a refused profile fetch, a network
    failure or a response missing the fields it needs - never carries the
    token or the code.
    """


class DiscordGrantRevoked(Exception):
    """``refresh()`` got a 400 ``invalid_grant``: Discord itself revoked the
    stored refresh token. The caller marks the connection
    ``needs_reconnect``."""


class DiscordUnavailable(Exception):
    """``refresh()`` failed for a reason that is not the grant being
    revoked: a 429, a 5xx or a network error. The caller should retry
    later and must not mark the connection ``needs_reconnect`` for this."""


@dataclass
class DiscordGrant:
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    expires_in: int
    scope: str


@dataclass
class DiscordProfile:
    id: int
    username: str
    global_name: str | None
    avatar: str | None


class DiscordOAuthService:
    def __init__(self) -> None:
        self.client_id = envs.DISCORD_CLIENT_ID
        self.client_secret = envs.DISCORD_CLIENT_SECRET
        self.redirect_uri = envs.DISCORD_LINK_REDIRECT_URI

    def is_configured(self) -> bool:
        return bool(
            self.client_id
            and self.client_secret
            and envs.DISCORD_TOKEN_ENCRYPTION_KEY
        )

    def get_authorize_url(self, state: str) -> str:
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'scope': SCOPE,
            'state': state,
        }
        return f'{_AUTHORIZE_URL}?{urlencode(params)}'

    async def exchange_code(self, code: str) -> DiscordGrant:
        """Exchange an authorization code for a grant. Never logs the code
        or any token; the code is never in the exception message either."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
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
                    timeout=_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord token exchange failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_link_failed',
                        'reason': 'network_error',
                    }
                },
            )
            raise DiscordLinkError('Discord was unreachable') from exc

        if response.status_code >= 400:
            logger.warning(
                'Discord token exchange refused',
                extra={
                    'extra_data': {
                        'event': 'discord_link_failed',
                        'reason': 'token_exchange_refused',
                        'status_code': response.status_code,
                    }
                },
            )
            raise DiscordLinkError('Discord token exchange refused')

        body = response.json()
        access_token = body.get('access_token')
        refresh_token = body.get('refresh_token')
        if not access_token or not refresh_token:
            raise DiscordLinkError(
                'Discord token response carried no usable token'
            )

        return DiscordGrant(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=int(body.get('expires_in') or 0),
            scope=body.get('scope') or '',
        )

    async def fetch_profile(self, access_token: str) -> DiscordProfile:
        """Read the Discord identity. The access token is never stored,
        logged or returned - it only ever lives in this call's headers."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    _USERINFO_URL,
                    headers={'Authorization': f'Bearer {access_token}'},
                    timeout=_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord userinfo request failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_link_failed',
                        'reason': 'network_error',
                    }
                },
            )
            raise DiscordLinkError('Discord was unreachable') from exc

        if response.status_code >= 400:
            logger.warning(
                'Discord userinfo request refused',
                extra={
                    'extra_data': {
                        'event': 'discord_link_failed',
                        'reason': 'userinfo_refused',
                        'status_code': response.status_code,
                    }
                },
            )
            raise DiscordLinkError('Discord userinfo request refused')

        body = response.json()
        discord_id = body.get('id')
        username = body.get('username')
        if not discord_id or not username:
            raise DiscordLinkError(
                'Discord userinfo response carried no id or username'
            )

        return DiscordProfile(
            id=int(discord_id),
            username=username,
            global_name=body.get('global_name'),
            avatar=body.get('avatar'),
        )

    async def refresh(self, refresh_token: str) -> DiscordGrant:
        """Renew the stored grant.

        A 400 ``invalid_grant`` means Discord itself revoked the token -
        ``DiscordGrantRevoked``, the caller marks the connection
        ``needs_reconnect``. A 429, a 5xx or a network error is
        ``DiscordUnavailable`` - transient, retried later, the connection
        stays as it was.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    _TOKEN_URL,
                    data={
                        'grant_type': 'refresh_token',
                        'refresh_token': refresh_token,
                        'client_id': self.client_id,
                        'client_secret': self.client_secret,
                    },
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout=_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord refresh failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_refresh_failed',
                        'reason': 'network_error',
                    }
                },
            )
            raise DiscordUnavailable('Discord was unreachable') from exc

        if response.status_code == 400:
            try:
                error = response.json().get('error')
            except ValueError:
                error = None
            if error == 'invalid_grant':
                logger.info(
                    'Discord refresh token was revoked',
                    extra={
                        'extra_data': {
                            'event': 'discord_grant_revoked',
                        }
                    },
                )
                raise DiscordGrantRevoked('Discord refresh token was revoked')
            raise DiscordUnavailable('Discord refresh refused')

        if response.status_code == 429 or response.status_code >= 500:
            logger.warning(
                'Discord refresh unavailable',
                extra={
                    'extra_data': {
                        'event': 'discord_refresh_failed',
                        'status_code': response.status_code,
                    }
                },
            )
            raise DiscordUnavailable('Discord was unavailable')

        if response.status_code >= 400:
            raise DiscordUnavailable('Discord refresh refused')

        try:
            body = response.json()
            access_token = body.get('access_token')
            refresh_token_out = body.get('refresh_token') or refresh_token
            expires_in = int(body.get('expires_in') or 0)
            scope = body.get('scope') or ''
        except (ValueError, AttributeError, TypeError) as exc:
            # A 2xx that is not the JSON object Discord promises (an HTML
            # error page from an edge proxy, a plain string) - treated the
            # same as any other unusable answer, never an unhandled raise
            # past this method (T123: "any other non-2xx or an
            # httpx.HTTPError -> DiscordUnavailable"; a malformed 2xx body
            # is just as unusable).
            raise DiscordUnavailable(
                'Discord refresh response was not usable'
            ) from exc

        if not access_token:
            raise DiscordUnavailable(
                'Discord refresh response carried no access token'
            )

        return DiscordGrant(
            access_token=access_token,
            refresh_token=refresh_token_out,
            expires_in=expires_in,
            scope=scope,
        )

    async def list_guild_ids(self, access_token: str) -> set[int]:
        """List the ids of the Discord servers the user is in (K8).

        Never logs or stores the access token - it lives only in this
        call's headers. A non-2xx answer or a network error is
        ``DiscordUnavailable``; there is no retry, so a 429 is never slept
        on here.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    _GUILDS_URL,
                    params={'limit': 200},
                    headers={'Authorization': f'Bearer {access_token}'},
                    timeout=_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord guild list request failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_guild_list_failed',
                        'reason': 'network_error',
                    }
                },
            )
            raise DiscordUnavailable('Discord was unreachable') from exc

        if response.status_code >= 400:
            logger.warning(
                'Discord guild list request refused',
                extra={
                    'extra_data': {
                        'event': 'discord_guild_list_failed',
                        'status_code': response.status_code,
                    }
                },
            )
            raise DiscordUnavailable('Discord guild list request refused')

        try:
            body = response.json()
            return {int(guild['id']) for guild in body if guild.get('id')}
        except (ValueError, AttributeError, TypeError) as exc:
            raise DiscordUnavailable(
                'Discord guild list response was not usable'
            ) from exc

    async def get_member_role_ids(
        self, access_token: str, guild_id: int
    ) -> set[int]:
        """Read the user's role ids in one server (K8).

        A 404 (the user is not a member of that server any more) is an
        empty set, not an error. Any other non-2xx or a network error is
        ``DiscordUnavailable``; no retry, no sleep on a 429.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    _member_url(guild_id),
                    headers={'Authorization': f'Bearer {access_token}'},
                    timeout=_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Discord member request failed: {type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'discord_member_lookup_failed',
                        'reason': 'network_error',
                    }
                },
            )
            raise DiscordUnavailable('Discord was unreachable') from exc

        if response.status_code == 404:
            return set()

        if response.status_code >= 400:
            logger.warning(
                'Discord member request refused',
                extra={
                    'extra_data': {
                        'event': 'discord_member_lookup_failed',
                        'status_code': response.status_code,
                    }
                },
            )
            raise DiscordUnavailable('Discord member request refused')

        try:
            body = response.json()
            return {int(role) for role in body.get('roles') or []}
        except (ValueError, AttributeError, TypeError) as exc:
            raise DiscordUnavailable(
                'Discord member response was not usable'
            ) from exc

    async def revoke(self, refresh_token: str) -> None:
        """Best-effort revoke of the stored refresh token
        (``token_type_hint=refresh_token``). A Discord failure here never
        blocks the caller: swallowed and logged without the token value."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    _REVOKE_URL,
                    data={
                        'token': refresh_token,
                        'token_type_hint': 'refresh_token',
                        'client_id': self.client_id,
                        'client_secret': self.client_secret,
                    },
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout=_TIMEOUT_SECONDS,
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
