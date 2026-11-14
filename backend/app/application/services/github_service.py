"""GitHub OAuth for the one-shot data restore (ADR-0024).

GitHub is no longer a sign-in. A restore asks GitHub for the public
identity only (scope ``read:user``), reads the id and login once, then
revokes the grant best-effort. No GitHub token is stored or logged.
"""

from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx

from app.config.logging import logger
from app.config.settings import envs

_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
_TOKEN_URL = 'https://github.com/login/oauth/access_token'
_API_BASE = 'https://api.github.com'
_HEADERS = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
}
SCOPE = 'read:user'
_TIMEOUT_SECONDS = 10


class GitHubOAuthError(Exception):
    """The code exchange or the identity read failed. Never carries the
    code or a token."""


@dataclass(frozen=True)
class GitHubIdentity:
    id: int
    login: str


@dataclass(frozen=True)
class GitHubGrant:
    access_token: str = field(repr=False)


class GitHubOAuthService:
    def __init__(
        self, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.client_id = envs.GITHUB_CLIENT_ID
        self.client_secret = envs.GITHUB_CLIENT_SECRET
        self.redirect_uri = envs.GITHUB_REDIRECT_URI
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=_TIMEOUT_SECONDS, transport=self._transport
        )

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def authorize_url(self, state: str) -> str:
        params = {
            'client_id': self.client_id or '',
            'redirect_uri': self.redirect_uri,
            'scope': SCOPE,
            'state': state,
            'allow_signup': 'false',
        }
        return f'{_AUTHORIZE_URL}?{urlencode(params)}'

    async def exchange_code(self, code: str) -> GitHubGrant:
        try:
            async with self._client() as client:
                response = await client.post(
                    _TOKEN_URL,
                    headers={'Accept': 'application/json'},
                    data={
                        'client_id': self.client_id,
                        'client_secret': self.client_secret,
                        'code': code,
                        'redirect_uri': self.redirect_uri,
                    },
                )
        except httpx.HTTPError as exc:
            raise GitHubOAuthError('GitHub token exchange failed') from exc
        if response.status_code != 200:
            raise GitHubOAuthError('GitHub token exchange failed')
        try:
            token = response.json().get('access_token')
        except (ValueError, AttributeError) as exc:
            raise GitHubOAuthError('GitHub token exchange failed') from exc
        if not isinstance(token, str) or not token:
            raise GitHubOAuthError('GitHub token exchange failed')
        return GitHubGrant(access_token=token)

    async def fetch_identity(self, access_token: str) -> GitHubIdentity:
        try:
            async with self._client() as client:
                response = await client.get(
                    f'{_API_BASE}/user',
                    headers={
                        **_HEADERS,
                        'Authorization': f'Bearer {access_token}',
                    },
                )
        except httpx.HTTPError as exc:
            raise GitHubOAuthError('GitHub identity read failed') from exc
        if response.status_code != 200:
            raise GitHubOAuthError('GitHub identity read failed')
        try:
            body = response.json()
            return GitHubIdentity(id=int(body['id']), login=str(body['login']))
        except (ValueError, KeyError, TypeError) as exc:
            raise GitHubOAuthError('GitHub identity read failed') from exc

    async def revoke(self, access_token: str) -> None:
        """Best effort: a failure is logged without the token, never
        raised."""
        try:
            async with self._client() as client:
                response = await client.request(
                    'DELETE',
                    f'{_API_BASE}/applications/{self.client_id}/token',
                    auth=(self.client_id or '', self.client_secret or ''),
                    headers=_HEADERS,
                    json={'access_token': access_token},
                )
            if response.status_code not in (204, 404):
                logger.warning(
                    f'GitHub grant revoke answered {response.status_code}'
                )
        except httpx.HTTPError as exc:
            logger.warning(f'GitHub grant revoke failed ({type(exc).__name__})')
