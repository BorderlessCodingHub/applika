"""A fake Borderless OpenID Connect provider (ADR-0026 §12).

Plays the whole sign-in Borderless gave applika, as a confidential client
with PKCE: discovery, a sign-in page where the test picks the account, the
code exchange with its client and PKCE checks, refresh with rotation, reuse
refusal, refusal on demand, a controllable clock, JWKS (Ed25519, EdDSA
id_tokens) and revocation. Backend tests drive it in-process through
``fake.transport()`` (an ``httpx.MockTransport``); the E2E stack and local
runs serve it over HTTP::

    python fake_oidc.py --config accounts.json --port 8081 \\
        --issuer http://127.0.0.1:8081/api/auth \\
        [--public-url http://127.0.0.1:8181] [--access-ttl 3600]

Every provider endpoint sits under the issuer's path (as on Borderless,
whose issuer is ``https://api.borderlesscoding.com/api/auth``):

- ``GET {issuer}/.well-known/openid-configuration``; the authorize endpoint
  is advertised on ``--public-url`` + the issuer's path when given (the
  browser and the API reach the fake by different hosts in compose), every
  other endpoint on the issuer;
- ``GET {issuer}/jwks``;
- ``GET|POST {issuer}/oauth2/authorize`` (the sign-in page; cookie
  ``fake_bl_session``);
- ``POST {issuer}/oauth2/token`` and ``POST {issuer}/oauth2/revoke``
  (HTTP Basic client authentication).

At the root: ``GET /health`` and the test controls, which Borderless does
not have: ``POST /__fake/accounts/{sub}`` ``{membership?, email_verified?,
deny?}``, ``POST /__fake/grants/{sub}/revoke``, ``POST /__fake/clock``
``{advance_seconds}``, ``GET /__fake/log`` and ``POST /__fake/reset``.

Standard library plus ``pyjwt`` and ``cryptography`` (``httpx`` only for
``transport()``), all in the backend's environment. It imports nothing from
``app``. Synthetic credentials only; nothing it logs or answers on
``/__fake/log`` carries a password, a client secret or a token.
"""

import argparse
import base64
import copy
import hashlib
import html
import json
import secrets
import sys
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote_plus, urlencode, urlsplit

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
)

DEFAULT_CONFIG = Path(__file__).with_name('accounts.json')
SESSION_COOKIE = 'fake_bl_session'
CODE_TTL_SECONDS = 60
ID_TOKEN_TTL_SECONDS = 10 * 3600
REFRESH_WINDOW_SECONDS = 30 * 24 * 3600
SCOPES = 'openid profile email offline_access'


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def s256(verifier: str) -> str:
    """The PKCE S256 challenge of ``verifier`` (RFC 7636)."""
    return _b64url(hashlib.sha256(verifier.encode()).digest())


@dataclass
class FakeRequest:
    method: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b''

    @property
    def path(self) -> str:
        return urlsplit(self.url).path

    @property
    def query(self) -> dict[str, str]:
        return _single(parse_qs(urlsplit(self.url).query))

    def form(self) -> dict[str, str]:
        return _single(parse_qs(self.body.decode(errors='replace')))

    def json(self) -> dict[str, Any]:
        try:
            data = json.loads(self.body or b'{}')
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def header(self, name: str) -> str:
        return self.headers.get(name.lower(), '')

    def cookie(self, name: str) -> str | None:
        for part in self.header('cookie').split(';'):
            key, _, value = part.strip().partition('=')
            if key == name:
                return value
        return None


@dataclass
class FakeResponse:
    status: int
    headers: list[tuple[str, str]]
    body: bytes = b''

    def header(self, name: str) -> str | None:
        for key, value in self.headers:
            if key.lower() == name.lower():
                return value
        return None


def _single(values: dict[str, list[str]]) -> dict[str, str]:
    return {key: items[0] for key, items in values.items() if items}


def _json(
    status: int, body: Any, headers: tuple[tuple[str, str], ...] = ()
) -> FakeResponse:
    return FakeResponse(
        status,
        [('Content-Type', 'application/json'), *headers],
        json.dumps(body).encode(),
    )


def _redirect(location: str, *, cookie: str | None = None) -> FakeResponse:
    headers = [('Location', location)]
    if cookie is not None:
        headers.append(
            ('Set-Cookie', f'{SESSION_COOKIE}={cookie}; Path=/; HttpOnly')
        )
    return FakeResponse(303, headers)


def _with_query(url: str, params: dict[str, str]) -> str:
    return f'{url}{"&" if "?" in url else "?"}{urlencode(params)}'


_NO_STORE = (('Cache-Control', 'no-store'), ('Pragma', 'no-cache'))
_AUTHORIZE_PARAMS = (
    'response_type',
    'client_id',
    'redirect_uri',
    'scope',
    'state',
    'nonce',
    'code_challenge',
    'code_challenge_method',
    'prompt',
)


class FakeBorderless:
    """The provider's state and its request handling, shared by the HTTP
    server and ``transport()``. Thread-safe."""

    def __init__(
        self,
        config: dict[str, Any],
        issuer: str,
        public_url: str | None = None,
        access_ttl: int = 3600,
    ) -> None:
        self.config = copy.deepcopy(config)
        self.client = self.config['client']
        self.issuer = issuer.rstrip('/')
        self.issuer_path = urlsplit(self.issuer).path.rstrip('/')
        self.public_url = (public_url or '').rstrip('/') or None
        self.access_ttl = int(access_ttl)
        self.lock = threading.RLock()
        self.rotate_key()
        self.reset()

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    def rotate_key(self) -> str:
        """A new Ed25519 signing key under a new ``kid``; the old one is
        gone from the JWKS. Returns the new ``kid``."""
        with self.lock:
            self.key = Ed25519PrivateKey.generate()
            self.kid = f'fake-{secrets.token_hex(4)}'
            return self.kid

    def reset(self) -> None:
        """Back to the config: accounts, no session, code or grant, clock
        at real time, empty log; each ``seedRefreshToken`` armed again."""
        with self.lock:
            self.offset = 0.0
            self.accounts = {
                account['sub']: copy.deepcopy(account)
                for account in self.config['accounts']
            }
            self.sessions: dict[str, str] = {}
            self.codes: dict[str, dict[str, Any]] = {}
            self.refresh_tokens: dict[str, dict[str, Any]] = {}
            self.families: dict[str, dict[str, Any]] = {}
            self.log: dict[str, Any] = {
                'authorize': [],
                'grants': {},
                'token_errors': [],
                'revokes': [],
                'control_revokes': [],
            }
            for account in self.accounts.values():
                seed = account.get('seedRefreshToken')
                if seed:
                    family = self._new_family(account['sub'])
                    self.refresh_tokens[seed] = {
                        'family': family,
                        'used': False,
                    }

    def now(self) -> float:
        """The fake clock: real time plus every ``advance``."""
        return time.time() + self.offset

    def advance(self, seconds: float) -> None:
        with self.lock:
            self.offset += float(seconds)

    def add_account(
        self,
        sub: str,
        email: str,
        *,
        membership: str | None = None,
        email_verified: bool = True,
        name: str | None = None,
        preferred_username: str | None = None,
        password: str | None = None,
    ) -> None:
        """An account beside the config's, for a test (gone at reset)."""
        with self.lock:
            self.accounts[sub] = {
                'sub': sub,
                'email': email,
                'password': password or secrets.token_urlsafe(12),
                'name': name,
                'preferred_username': preferred_username,
                'email_verified': email_verified,
                'membership': membership,
            }

    def issue_refresh_token(self, sub: str, token: str | None = None) -> str:
        """A refresh token of a new grant of ``sub``, started now on the
        fake clock, as if the account had just signed in (tests that bind
        a user directly in the database)."""
        with self.lock:
            value = token or secrets.token_urlsafe(32)
            self.refresh_tokens[value] = {
                'family': self._new_family(sub),
                'used': False,
            }
            return value

    def set_account(self, sub: str, **changes: Any) -> dict[str, Any]:
        with self.lock:
            account = self.accounts[sub]
            for name in ('membership', 'email_verified', 'deny'):
                if name in changes:
                    account[name] = changes[name]
            return self._public(account)

    def revoke_grants(self, sub: str) -> int:
        """End every grant of ``sub``: its next refresh is
        ``invalid_grant``."""
        with self.lock:
            revoked = 0
            for family in self.families.values():
                if family['sub'] == sub and not family['revoked']:
                    family['revoked'] = True
                    revoked += 1
            self.log['control_revokes'].append({'sub': sub, 'count': revoked})
            return revoked

    def jwks(self) -> dict[str, Any]:
        raw = self.key.public_key().public_bytes(
            Encoding.Raw, PublicFormat.Raw
        )
        return {
            'keys': [
                {
                    'kty': 'OKP',
                    'crv': 'Ed25519',
                    'x': _b64url(raw),
                    'kid': self.kid,
                    'alg': 'EdDSA',
                    'use': 'sig',
                }
            ]
        }

    def discovery(self) -> dict[str, Any]:
        browser_base = (
            f'{self.public_url}{self.issuer_path}'
            if self.public_url
            else self.issuer
        )
        return {
            'issuer': self.issuer,
            'authorization_endpoint': f'{browser_base}/oauth2/authorize',
            'token_endpoint': f'{self.issuer}/oauth2/token',
            'revocation_endpoint': f'{self.issuer}/oauth2/revoke',
            'jwks_uri': f'{self.issuer}/jwks',
            'response_types_supported': ['code'],
            'grant_types_supported': ['authorization_code', 'refresh_token'],
            'subject_types_supported': ['public'],
            'scopes_supported': SCOPES.split(),
            'id_token_signing_alg_values_supported': ['EdDSA'],
            'token_endpoint_auth_methods_supported': ['client_secret_basic'],
            'code_challenge_methods_supported': ['S256'],
            'authorization_response_iss_parameter_supported': True,
            'claims_supported': [
                'sub',
                'name',
                'picture',
                'preferred_username',
                'email',
                'email_verified',
                'borderless_membership',
            ],
        }

    def sign_id_token(
        self,
        claims: dict[str, Any],
        *,
        key: Any = None,
        algorithm: str = 'EdDSA',
        headers: dict[str, Any] | None = None,
    ) -> str:
        """Sign arbitrary claims, for tests that need a bad id_token."""
        return jwt.encode(
            claims,
            self.key if key is None else key,
            algorithm=algorithm,
            headers={'kid': self.kid, **(headers or {})},
        )

    def id_token_claims(
        self, sub: str, nonce: str | None = None
    ) -> dict[str, Any]:
        """The claims Borderless puts in an id_token. ``iat``/``exp`` use
        real time (applika checks them against its own clock)."""
        account = self.accounts[sub]
        issued = int(time.time())
        claims: dict[str, Any] = {
            'iss': self.issuer,
            'sub': sub,
            'aud': self.client['client_id'],
            'iat': issued,
            'exp': issued + ID_TOKEN_TTL_SECONDS,
            'name': account.get('name'),
            'picture': account.get('picture'),
            'preferred_username': account.get('preferred_username'),
            'email': account['email'],
            'email_verified': bool(account.get('email_verified', True)),
        }
        if account.get('membership') is not None:
            claims['borderless_membership'] = account['membership']
        if nonce is not None:
            claims['nonce'] = nonce
        return claims

    def _public(self, account: dict[str, Any]) -> dict[str, Any]:
        return {
            k: v
            for k, v in account.items()
            if k not in ('password', 'seedRefreshToken')
        }

    def _new_family(self, sub: str) -> str:
        family = secrets.token_hex(8)
        self.families[family] = {
            'sub': sub,
            'started_at': self.now(),
            'revoked': False,
        }
        return family

    # ------------------------------------------------------------------
    # HTTP
    # ------------------------------------------------------------------

    def handle(self, request: FakeRequest) -> FakeResponse:
        with self.lock:
            return self._route(request)

    def _route(self, request: FakeRequest) -> FakeResponse:
        path = request.path.rstrip('/') or '/'
        method = request.method.upper()
        if path == '/health':
            return _json(200, {'status': 'ok'})
        if path.startswith('/__fake/'):
            return self._control(method, path, request)
        if path.startswith(self.issuer_path):
            sub_path = path[len(self.issuer_path) :]
            if sub_path == '/.well-known/openid-configuration':
                return _json(200, self.discovery())
            if sub_path == '/jwks':
                return _json(200, self.jwks())
            if sub_path == '/oauth2/authorize' and method in ('GET', 'POST'):
                return self._authorize(request)
            if sub_path == '/oauth2/token' and method == 'POST':
                return self._token(request)
            if sub_path == '/oauth2/revoke' and method == 'POST':
                return self._revoke(request)
        return _json(404, {'error': 'not_found'})

    # -- authorize -------------------------------------------------------

    def _authorize(self, request: FakeRequest) -> FakeResponse:
        params = request.query if request.method == 'GET' else request.form()
        if request.method == 'GET':
            self.log['authorize'].append(
                {k: params[k] for k in _AUTHORIZE_PARAMS if k in params}
            )
        if params.get('client_id') != self.client['client_id']:
            return self._page('Unknown client_id', status=400)
        redirect_uri = params.get('redirect_uri', '')
        if redirect_uri not in self.client['redirect_uris']:
            return self._page('redirect_uri is not registered', status=400)
        error = self._authorize_error(params)
        if error is not None:
            return self._back(params, {'error': error})

        session = request.cookie(SESSION_COOKIE)
        signed_in = self.sessions.get(session or '')
        prompt = params.get('prompt', '')
        if request.method == 'GET':
            if signed_in is not None and prompt != 'login':
                return self._issue(params, signed_in)
            if prompt == 'none':
                return self._back(params, {'error': 'login_required'})
            return self._page(None, params=params)

        sub = self._authenticate(request.form())
        if sub is None:
            return self._page(
                'Invalid email or password', params=params, status=401
            )
        new_session = secrets.token_urlsafe(24)
        self.sessions[new_session] = sub
        return self._issue(params, sub, cookie=new_session)

    def _authorize_error(self, params: dict[str, str]) -> str | None:
        if params.get('response_type') != 'code':
            return 'unsupported_response_type'
        if 'openid' not in params.get('scope', '').split():
            return 'invalid_scope'
        if params.get('code_challenge_method') != 'S256' or not params.get(
            'code_challenge'
        ):
            return 'invalid_request'
        if not params.get('state'):
            return 'invalid_request'
        return None

    def _authenticate(self, form: dict[str, str]) -> str | None:
        chosen = form.get('account')
        if chosen:
            return chosen if chosen in self.accounts else None
        email = form.get('email', '').strip().lower()
        for account in self.accounts.values():
            if (
                account['email'].lower() == email
                and account.get('password') == form.get('password')
            ):
                return account['sub']
        return None

    def _issue(
        self, params: dict[str, str], sub: str, cookie: str | None = None
    ) -> FakeResponse:
        if self.accounts[sub].get('deny'):
            return self._back(
                params,
                {
                    'error': 'access_denied',
                    'error_description': 'The sign-in was refused',
                },
                cookie=cookie,
            )
        code = secrets.token_urlsafe(32)
        self.codes[code] = {
            'sub': sub,
            'redirect_uri': params['redirect_uri'],
            'challenge': params['code_challenge'],
            'nonce': params.get('nonce'),
            'issued_at': self.now(),
            'used': False,
        }
        return self._back(params, {'code': code}, cookie=cookie)

    def _back(
        self,
        params: dict[str, str],
        answer: dict[str, str],
        cookie: str | None = None,
    ) -> FakeResponse:
        query = dict(answer)
        if params.get('state'):
            query['state'] = params['state']
        query['iss'] = self.issuer
        return _redirect(
            _with_query(params['redirect_uri'], query), cookie=cookie
        )

    def _page(
        self,
        error: str | None,
        params: dict[str, str] | None = None,
        status: int = 200,
    ) -> FakeResponse:
        esc = html.escape
        action = f'{self.issuer_path}/oauth2/authorize'
        hidden = ''.join(
            f'<input type="hidden" name="{esc(k)}" value="{esc(v)}">'
            for k, v in (params or {}).items()
            if k in _AUTHORIZE_PARAMS
        )
        parts = [
            '<!doctype html><html lang="en"><head><meta charset="utf-8">',
            '<title>Sign in to Borderless (fake)</title></head><body>',
            '<h1>Sign in to Borderless (fake)</h1>',
        ]
        if error:
            parts.append(f'<p role="alert">{esc(error)}</p>')
        if params is not None:
            parts += [
                f'<form method="post" action="{esc(action)}">{hidden}',
                '<label for="email">Email</label>',
                '<input id="email" name="email" type="email">',
                '<label for="password">Password</label>',
                '<input id="password" name="password" type="password">',
                '<button type="submit">Sign in</button></form>',
                '<h2>Accounts</h2><ul>',
            ]
            for account in self.accounts.values():
                parts.append(
                    f'<li><form method="post" action="{esc(action)}">'
                    f'{hidden}<button type="submit" name="account" '
                    f'value="{esc(account["sub"])}">'
                    f'{esc(account["email"])}</button></form></li>'
                )
            parts.append('</ul>')
        parts.append('</body></html>')
        return FakeResponse(
            status,
            [('Content-Type', 'text/html; charset=utf-8')],
            ''.join(parts).encode(),
        )

    # -- token -----------------------------------------------------------

    def _client_ok(self, request: FakeRequest) -> bool:
        scheme, _, value = request.header('authorization').partition(' ')
        if scheme.lower() != 'basic':
            return False
        try:
            decoded = base64.b64decode(value.strip()).decode()
        except ValueError:
            return False
        client_id, _, client_secret = decoded.partition(':')
        return secrets.compare_digest(
            unquote_plus(client_id), self.client['client_id']
        ) and secrets.compare_digest(
            unquote_plus(client_secret), self.client['client_secret']
        )

    def _token(self, request: FakeRequest) -> FakeResponse:
        form = request.form()
        grant_type = form.get('grant_type', '')
        if not self._client_ok(request):
            self._token_error(grant_type, 'invalid_client')
            return _json(
                401,
                {'error': 'invalid_client'},
                (('WWW-Authenticate', 'Basic realm="borderless"'),),
            )
        if grant_type == 'authorization_code':
            return self._code_grant(form)
        if grant_type == 'refresh_token':
            return self._refresh_grant(form)
        self._token_error(grant_type, 'unsupported_grant_type')
        return _json(400, {'error': 'unsupported_grant_type'})

    def _token_error(
        self, grant_type: str, error: str, sub: str | None = None
    ) -> None:
        self.log['token_errors'].append(
            {'grant_type': grant_type, 'error': error, 'sub': sub}
        )

    def _invalid_grant(
        self, grant_type: str, sub: str | None = None
    ) -> FakeResponse:
        self._token_error(grant_type, 'invalid_grant', sub)
        return _json(400, {'error': 'invalid_grant'}, _NO_STORE)

    def _code_grant(self, form: dict[str, str]) -> FakeResponse:
        grant = 'authorization_code'
        entry = self.codes.get(form.get('code', ''))
        if entry is None or entry['used']:
            return self._invalid_grant(grant)
        entry['used'] = True
        if self.now() - entry['issued_at'] > CODE_TTL_SECONDS:
            return self._invalid_grant(grant, entry['sub'])
        if form.get('redirect_uri') != entry['redirect_uri']:
            return self._invalid_grant(grant, entry['sub'])
        verifier = form.get('code_verifier', '')
        if not 43 <= len(verifier) <= 128 or not secrets.compare_digest(
            s256(verifier), entry['challenge']
        ):
            return self._invalid_grant(grant, entry['sub'])
        family = self._new_family(entry['sub'])
        return self._grant(grant, entry['sub'], family, entry['nonce'])

    def _refresh_grant(self, form: dict[str, str]) -> FakeResponse:
        grant = 'refresh_token'
        entry = self.refresh_tokens.get(form.get('refresh_token', ''))
        if entry is None:
            return self._invalid_grant(grant)
        family = self.families[entry['family']]
        if entry['used']:
            # Reuse of a rotated token: the whole family is revoked.
            family['revoked'] = True
            return self._invalid_grant(grant, family['sub'])
        if family['revoked']:
            return self._invalid_grant(grant, family['sub'])
        if self.now() - family['started_at'] > REFRESH_WINDOW_SECONDS:
            return self._invalid_grant(grant, family['sub'])
        entry['used'] = True
        return self._grant(grant, family['sub'], entry['family'], None)

    def _grant(
        self, grant_type: str, sub: str, family: str, nonce: str | None
    ) -> FakeResponse:
        refresh_token = secrets.token_urlsafe(32)
        self.refresh_tokens[refresh_token] = {'family': family, 'used': False}
        self.log['grants'].setdefault(sub, []).append(
            {'grant_type': grant_type, 'at': self.now()}
        )
        return _json(
            200,
            {
                'access_token': secrets.token_urlsafe(32),
                'token_type': 'Bearer',
                'expires_in': self.access_ttl,
                'refresh_token': refresh_token,
                'id_token': self.sign_id_token(
                    self.id_token_claims(sub, nonce)
                ),
                'scope': SCOPES,
            },
            _NO_STORE,
        )

    def _revoke(self, request: FakeRequest) -> FakeResponse:
        if not self._client_ok(request):
            return _json(401, {'error': 'invalid_client'})
        form = request.form()
        entry = self.refresh_tokens.get(form.get('token', ''))
        sub = None
        if entry is not None:
            family = self.families[entry['family']]
            family['revoked'] = True
            sub = family['sub']
        self.log['revokes'].append(
            {
                'sub': sub,
                'token_type_hint': form.get('token_type_hint'),
                'known': entry is not None,
            }
        )
        return FakeResponse(200, [])

    # -- controls --------------------------------------------------------

    def _control(
        self, method: str, path: str, request: FakeRequest
    ) -> FakeResponse:
        parts = path.split('/')[2:]
        if method == 'GET' and parts == ['log']:
            return _json(200, self.log)
        if method != 'POST':
            return _json(404, {'error': 'not_found'})
        if parts == ['reset']:
            self.reset()
            return _json(200, {'status': 'reset'})
        if parts == ['clock']:
            self.advance(float(request.json().get('advance_seconds', 0)))
            return _json(200, {'now': self.now()})
        if len(parts) == 2 and parts[0] == 'accounts':
            if parts[1] not in self.accounts:
                return _json(404, {'error': 'unknown_account'})
            return _json(200, self.set_account(parts[1], **request.json()))
        if len(parts) == 3 and parts[0] == 'grants' and parts[2] == 'revoke':
            if parts[1] not in self.accounts:
                return _json(404, {'error': 'unknown_account'})
            return _json(200, {'revoked': self.revoke_grants(parts[1])})
        return _json(404, {'error': 'not_found'})

    # ------------------------------------------------------------------
    # Adapters
    # ------------------------------------------------------------------

    def transport(self) -> Any:
        """An ``httpx.MockTransport`` answering every request in-process,
        whatever its host."""
        import httpx

        def handler(request: httpx.Request) -> httpx.Response:
            answer = self.handle(
                FakeRequest(
                    method=request.method,
                    url=str(request.url),
                    headers={
                        k.lower(): v for k, v in request.headers.items()
                    },
                    body=request.content,
                )
            )
            return httpx.Response(
                answer.status, headers=answer.headers, content=answer.body
            )

        return httpx.MockTransport(handler)


def load_config(path: Path = DEFAULT_CONFIG) -> dict[str, Any]:
    return json.loads(Path(path).read_text())


def make_handler(fake: FakeBorderless) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            # Method and path only: never a query, a body, a header or a
            # token.
            sys.stderr.write(
                f'fake-borderless {self.command} {self.path.split("?")[0]}\n'
            )

        def _serve(self) -> None:
            length = int(self.headers.get('Content-Length') or 0)
            body = self.rfile.read(length) if length else b''
            host = self.headers.get('Host', 'localhost')
            answer = fake.handle(
                FakeRequest(
                    method=self.command,
                    url=f'http://{host}{self.path}',
                    headers={k.lower(): v for k, v in self.headers.items()},
                    body=body,
                )
            )
            self.send_response(answer.status)
            for key, value in answer.headers:
                self.send_header(key, value)
            self.send_header('Content-Length', str(len(answer.body)))
            self.end_headers()
            self.wfile.write(answer.body)

        do_GET = _serve
        do_POST = _serve

    return Handler


def serve(
    fake: FakeBorderless, port: int, host: str = '0.0.0.0'
) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), make_handler(fake))


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(
        description='A fake Borderless OpenID Connect provider (ADR-0026)'
    )
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8081)
    parser.add_argument('--issuer', required=True)
    parser.add_argument('--public-url', default=None)
    parser.add_argument('--access-ttl', type=int, default=3600)
    args = parser.parse_args(argv)
    fake = FakeBorderless(
        load_config(args.config),
        args.issuer,
        public_url=args.public_url,
        access_ttl=args.access_ttl,
    )
    server = serve(fake, args.port, args.host)
    sys.stderr.write(
        f'fake Borderless on port {args.port}, issuer {fake.issuer}\n'
    )
    server.serve_forever()


if __name__ == '__main__':
    main(sys.argv[1:])
