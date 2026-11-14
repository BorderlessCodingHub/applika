"""Borderless OpenID Connect client (ADR-0026).

Applika is a confidential client of Borderless: the browser goes to the
authorize endpoint with a ``state``, a ``nonce`` and a PKCE S256 challenge;
the API exchanges the code with HTTP Basic (``client_secret_basic``), the
``code_verifier`` and the ``redirect_uri``, and re-reads the membership
with the ``refresh_token`` grant. Endpoints come from the issuer's
discovery document, cached; its ``issuer`` must equal
``BORDERLESS_ISSUER``. id_tokens are verified against the issuer's JWKS
with ``EdDSA`` only.

Nothing here logs or ``repr``s a code, a token, an id_token or the client
secret: logs carry status codes and the OAuth ``error`` only. User-info is
never called.
"""

import asyncio
import hmac
import re
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote, urlencode

import httpx
import jwt

from app.config.logging import logger
from app.config.settings import envs

SCOPES = 'openid profile email offline_access'
ID_TOKEN_ALGORITHMS = ['EdDSA']
ID_TOKEN_LEEWAY_SECONDS = 60
JWKS_REFETCH_SECONDS = 60
# A discovery refetch that fails keeps the last good document for this long
# before trying again.
DISCOVERY_RETRY_SECONDS = 60
_REQUIRED_CLAIMS = ['exp', 'iat', 'iss', 'aud', 'sub']
_OAUTH_ERROR_RE = re.compile(r'[a-z_]{1,40}')


class BorderlessError(Exception):
    """Base of every Borderless failure. Never carries a secret."""


class BorderlessNotConfigured(BorderlessError):
    """The issuer, the client id, the secret or the token key is unset."""


class BorderlessUnavailable(BorderlessError):
    """Borderless is slow, down, rate-limiting or answered unexpectedly."""


class BorderlessRejected(BorderlessError):
    """Borderless refused the exchange (4xx), or its answer could not be
    verified (id_token, missing refresh token)."""


class BorderlessGrantEnded(BorderlessError):
    """``invalid_grant`` on a refresh: 30 days after the sign-in, reused,
    or revoked. The user must sign in again."""


@dataclass(frozen=True)
class BorderlessIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str | None
    preferred_username: str | None
    membership: str | None


@dataclass(frozen=True)
class BorderlessGrant:
    identity: BorderlessIdentity
    refresh_token: str | None = field(repr=False)
    access_token: str = field(repr=False)
    expires_in: int = 0


@dataclass(frozen=True)
class Discovery:
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    revocation_endpoint: str | None


def _oauth_error(response: httpx.Response) -> str:
    """The OAuth ``error`` of a refusal, for logs and decisions: lower case
    letters and underscores only, else ``unknown``."""
    try:
        value = response.json().get('error')
    except ValueError, AttributeError:
        return 'unknown'
    if isinstance(value, str) and _OAUTH_ERROR_RE.fullmatch(value):
        return value
    return 'unknown'


def _string(claims: dict[str, Any], name: str) -> str | None:
    value = claims.get(name)
    return value if isinstance(value, str) and value.strip() else None


class BorderlessOidcClient:
    """One per process (``BorderlessOidcClientDp``): it holds the
    discovery document and the JWKS caches. Settings are read on each call,
    so a test can change them."""

    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self._discovery: Discovery | None = None
        self._discovery_at = 0.0
        self._jwks: jwt.PyJWKSet | None = None
        self._jwks_at = 0.0

    # -- configuration -----------------------------------------------------

    def is_configured(self) -> bool:
        return envs.borderless_configured

    @property
    def client_id(self) -> str:
        return envs.BORDERLESS_CLIENT_ID or ''

    @property
    def issuer(self) -> str:
        return envs.BORDERLESS_ISSUER or ''

    def _basic_auth(self) -> httpx.BasicAuth:
        """Built per call, never stored or logged (RFC 6749 §2.3.1:
        form-encoded id and secret)."""
        secret = envs.BORDERLESS_CLIENT_SECRET
        return httpx.BasicAuth(
            quote(self.client_id, safe=''),
            quote(secret.get_secret_value() if secret else '', safe=''),
        )

    # -- discovery and keys ------------------------------------------------

    async def discovery(self) -> Discovery:
        """The issuer's discovery document, cached for
        ``BORDERLESS_DISCOVERY_TTL_SECONDS``. ``BorderlessUnavailable``
        when it cannot be read or does not match the configuration and no
        good document is cached; a failed refetch keeps serving the last
        good one and tries again ``DISCOVERY_RETRY_SECONDS`` later."""
        if not self.is_configured():
            raise BorderlessNotConfigured('Borderless is not configured')
        now = time.monotonic()
        ttl = envs.BORDERLESS_DISCOVERY_TTL_SECONDS
        cached = (
            self._discovery
            if self._discovery is not None
            and self._discovery.issuer == self.issuer
            else None
        )
        if cached is not None and now - self._discovery_at < ttl:
            return cached
        try:
            self._discovery = await self._fetch_discovery()
        except BorderlessUnavailable:
            if cached is None:
                raise
            logger.warning('Borderless discovery kept from the last read')
            self._discovery_at = now - ttl + DISCOVERY_RETRY_SECONDS
            return cached
        self._discovery_at = now
        return self._discovery

    async def _fetch_discovery(self) -> Discovery:
        url = f'{self.issuer.rstrip("/")}/.well-known/openid-configuration'
        try:
            response = await self.http.get(
                url, timeout=envs.BORDERLESS_TIMEOUT_SECONDS
            )
        except httpx.HTTPError as exc:
            logger.warning(
                f'Borderless discovery failed ({type(exc).__name__})'
            )
            raise BorderlessUnavailable('discovery unreachable') from exc
        if response.status_code != 200:
            logger.warning(
                f'Borderless discovery answered {response.status_code}'
            )
            raise BorderlessUnavailable('discovery refused')
        return self._parse_discovery(response)

    def _parse_discovery(self, response: httpx.Response) -> Discovery:
        try:
            doc = response.json()
            discovery = Discovery(
                issuer=str(doc['issuer']),
                authorization_endpoint=str(doc['authorization_endpoint']),
                token_endpoint=str(doc['token_endpoint']),
                jwks_uri=str(doc['jwks_uri']),
                revocation_endpoint=(
                    str(doc['revocation_endpoint'])
                    if doc.get('revocation_endpoint')
                    else None
                ),
            )
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            logger.warning('Borderless discovery is not a valid document')
            raise BorderlessUnavailable('discovery unreadable') from exc
        if discovery.issuer != self.issuer:
            logger.warning('Borderless discovery names another issuer')
            raise BorderlessUnavailable('discovery issuer mismatch')
        methods = doc.get('code_challenge_methods_supported')
        algorithms = doc.get('id_token_signing_alg_values_supported')
        if (isinstance(methods, list) and 'S256' not in methods) or (
            isinstance(algorithms, list) and 'EdDSA' not in algorithms
        ):
            logger.warning('Borderless discovery lacks S256 or EdDSA')
            raise BorderlessUnavailable('discovery unsupported')
        return discovery

    async def _key_for(self, kid: str | None) -> Any:
        """The signing key named ``kid``: from the cached JWKS, refetched
        when unknown, at most once a minute."""
        key = self._find_key(kid)
        if key is not None:
            return key
        if self._jwks is not None and (
            time.monotonic() - self._jwks_at < JWKS_REFETCH_SECONDS
        ):
            raise BorderlessRejected('unknown signing key')
        await self._fetch_jwks()
        key = self._find_key(kid)
        if key is None:
            raise BorderlessRejected('unknown signing key')
        return key

    def _find_key(self, kid: str | None) -> Any:
        if self._jwks is None:
            return None
        keys = list(self._jwks.keys)
        if kid is None:
            return keys[0].key if len(keys) == 1 else None
        for jwk in keys:
            if jwk.key_id == kid:
                return jwk.key
        return None

    async def _fetch_jwks(self) -> None:
        discovery = await self.discovery()
        self._jwks_at = time.monotonic()
        try:
            response = await self.http.get(
                discovery.jwks_uri, timeout=envs.BORDERLESS_TIMEOUT_SECONDS
            )
        except httpx.HTTPError as exc:
            logger.warning(f'Borderless JWKS failed ({type(exc).__name__})')
            raise BorderlessUnavailable('jwks unreachable') from exc
        if response.status_code != 200:
            logger.warning(f'Borderless JWKS answered {response.status_code}')
            raise BorderlessUnavailable('jwks refused')
        try:
            self._jwks = jwt.PyJWKSet.from_dict(response.json())
        except (ValueError, jwt.PyJWKSetError) as exc:
            logger.warning('Borderless JWKS is not a valid key set')
            raise BorderlessUnavailable('jwks unreadable') from exc

    # -- the browser half --------------------------------------------------

    def authorize_url(
        self,
        discovery: Discovery,
        *,
        state: str,
        nonce: str,
        challenge: str,
        prompt_login: bool,
    ) -> str:
        """Where the browser signs in. ``prompt=login`` only for a CLI
        sign-in (ADR-0026 §11): a web sign-in uses Borderless's own
        session."""
        params = {
            'response_type': 'code',
            'client_id': self.client_id,
            'redirect_uri': envs.BORDERLESS_REDIRECT_URI,
            'scope': SCOPES,
            'state': state,
            'nonce': nonce,
            'code_challenge': challenge,
            'code_challenge_method': 'S256',
        }
        if prompt_login:
            params['prompt'] = 'login'
        separator = '&' if '?' in discovery.authorization_endpoint else '?'
        return (
            discovery.authorization_endpoint
            + separator
            + urlencode(params, quote_via=quote)
        )

    # -- the token endpoint ------------------------------------------------

    async def exchange(
        self, code: str, verifier: str, nonce: str
    ) -> BorderlessGrant:
        """Redeem the sign-in's code. One retry on a 5xx or a timeout;
        a 4xx, an id_token that does not verify (``nonce`` included) or a
        missing refresh token is ``BorderlessRejected``."""
        discovery = await self.discovery()
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': envs.BORDERLESS_REDIRECT_URI,
            'code_verifier': verifier,
        }
        response: httpx.Response | None = None
        for attempt in (1, 2):
            try:
                response = await self.http.post(
                    discovery.token_endpoint,
                    data=data,
                    auth=self._basic_auth(),
                    timeout=envs.BORDERLESS_TIMEOUT_SECONDS,
                )
            except httpx.HTTPError as exc:
                logger.warning(
                    f'Borderless code exchange failed '
                    f'({type(exc).__name__}), attempt {attempt}'
                )
                response = None
                continue
            if response.status_code < 500:
                break
            logger.warning(
                f'Borderless code exchange answered '
                f'{response.status_code}, attempt {attempt}'
            )
        if response is None or response.status_code >= 500:
            raise BorderlessUnavailable('token endpoint unavailable')
        if response.status_code != 200:
            logger.warning(
                f'Borderless code exchange answered {response.status_code} '
                f'({_oauth_error(response)})'
            )
            raise BorderlessRejected('code exchange refused')
        grant = await self._grant(response, nonce)
        if not grant.refresh_token:
            logger.warning('Borderless code exchange sent no refresh token')
            raise BorderlessRejected('no refresh token')
        return grant

    async def refresh(
        self, refresh_token: str, timeout: float | None = None
    ) -> BorderlessGrant:
        """The ``refresh_token`` grant, no retry, the whole of it (the
        discovery document, the token call and the id_token's keys) bounded
        by ``timeout``. ``invalid_grant`` is ``BorderlessGrantEnded``;
        slowness, a 5xx, a 429 or any other refusal is
        ``BorderlessUnavailable``. A refused id_token is
        ``BorderlessRejected``."""
        budget = timeout or envs.BORDERLESS_TIMEOUT_SECONDS
        try:
            async with asyncio.timeout(budget):
                discovery = await self.discovery()
                response = await self.http.post(
                    discovery.token_endpoint,
                    data={
                        'grant_type': 'refresh_token',
                        'refresh_token': refresh_token,
                    },
                    auth=self._basic_auth(),
                    timeout=budget,
                )
                if response.status_code == 200:
                    return await self._grant(response, None)
        except (httpx.HTTPError, TimeoutError) as exc:
            logger.warning(f'Borderless refresh failed ({type(exc).__name__})')
            raise BorderlessUnavailable('token endpoint unavailable') from exc
        status = response.status_code
        error = _oauth_error(response)
        logger.warning(f'Borderless refresh answered {status} ({error})')
        if status == 400 and error == 'invalid_grant':
            raise BorderlessGrantEnded('grant ended')
        raise BorderlessUnavailable('refresh refused')

    async def _grant(
        self, response: httpx.Response, nonce: str | None
    ) -> BorderlessGrant:
        try:
            body = response.json()
            access_token = body['access_token']
            expires_in = int(body.get('expires_in') or 0)
            raw_id_token = body['id_token']
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            logger.warning('Borderless token answer is not readable')
            raise BorderlessRejected('unreadable token answer') from exc
        if not isinstance(access_token, str) or not isinstance(
            raw_id_token, str
        ):
            raise BorderlessRejected('unreadable token answer')
        refresh_token = body.get('refresh_token')
        identity = await self.verify_id_token(raw_id_token, nonce)
        return BorderlessGrant(
            identity=identity,
            refresh_token=(
                refresh_token
                if isinstance(refresh_token, str) and refresh_token
                else None
            ),
            access_token=access_token,
            expires_in=max(0, expires_in),
        )

    async def verify_id_token(
        self, raw: str, nonce: str | None
    ) -> BorderlessIdentity:
        """The identity in an id_token signed by Borderless (EdDSA only),
        issued to applika (``aud``, and ``azp`` when present), unexpired,
        and on a sign-in carrying that attempt's ``nonce``."""
        try:
            header = jwt.get_unverified_header(raw)
        except jwt.PyJWTError as exc:
            raise BorderlessRejected('malformed id_token') from exc
        kid = header.get('kid')
        key = await self._key_for(kid if isinstance(kid, str) else None)
        try:
            claims = jwt.decode(
                raw,
                key,
                algorithms=ID_TOKEN_ALGORITHMS,
                audience=self.client_id,
                issuer=self.issuer,
                leeway=ID_TOKEN_LEEWAY_SECONDS,
                options={'require': _REQUIRED_CLAIMS},
            )
        except jwt.PyJWTError as exc:
            logger.warning(
                f'Borderless id_token refused ({type(exc).__name__})'
            )
            raise BorderlessRejected('id_token refused') from exc
        if 'azp' in claims and claims['azp'] != self.client_id:
            raise BorderlessRejected('id_token azp mismatch')
        if nonce is not None and not hmac.compare_digest(
            str(claims.get('nonce') or ''), nonce
        ):
            logger.warning('Borderless id_token nonce mismatch')
            raise BorderlessRejected('id_token nonce mismatch')
        sub = _string(claims, 'sub')
        email = _string(claims, 'email')
        if sub is None or email is None:
            raise BorderlessRejected('id_token lacks sub or email')
        return BorderlessIdentity(
            sub=sub,
            email=email.strip(),
            email_verified=claims.get('email_verified') is True,
            name=_string(claims, 'name'),
            preferred_username=_string(claims, 'preferred_username'),
            membership=_string(claims, 'borderless_membership'),
        )

    # -- revocation --------------------------------------------------------

    async def revoke(self, refresh_token: str) -> None:
        """Best effort (RFC 7009, ``token_type_hint=refresh_token``):
        every failure is a WARNING with its status, never raised."""
        try:
            discovery = await self.discovery()
            if discovery.revocation_endpoint is None:
                logger.warning('Borderless has no revocation endpoint')
                return
            response = await self.http.post(
                discovery.revocation_endpoint,
                data={
                    'token': refresh_token,
                    'token_type_hint': 'refresh_token',
                },
                auth=self._basic_auth(),
                timeout=envs.BORDERLESS_TIMEOUT_SECONDS,
            )
        except Exception as exc:  # best effort: never raised
            logger.warning(f'Borderless revoke failed ({type(exc).__name__})')
            return
        if response.status_code != 200:
            logger.warning(f'Borderless revoke answered {response.status_code}')


_client: BorderlessOidcClient | None = None


def borderless_oidc_client() -> BorderlessOidcClient:
    """The process's one client (its caches live as long as the process)."""
    global _client
    if _client is None:
        _client = BorderlessOidcClient(httpx.AsyncClient())
    return _client


async def close_borderless_oidc_client() -> None:
    global _client
    if _client is not None:
        await _client.http.aclose()
        _client = None
