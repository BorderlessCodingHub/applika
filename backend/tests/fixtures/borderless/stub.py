"""A Borderless stand-in for the E2E stack and local runs (ADR-0024).

Standard library only: ``python stub.py [accounts.json] [--port 8081]``.
Answers the two calls applika makes, in Borderless's shapes (owner's probe,
2026-10-29):

- ``POST /api/auth/signin`` ``{email, password}`` → 200
  ``{data: {user: {id, email, name, username, emailVerified}, token:
  {accessToken, expiresIn}}}``; 401 for a wrong email or password.
- ``GET /api/users/profile`` (Bearer) → 200 ``{data: {user: {id, email,
  membership, github: null}}}``; 401 for an unknown or expired token.

``expiresIn`` is an int or a list consumed one per sign-in (the last value
repeats). Issued tokens expire on the stub too. ``seedToken`` is accepted
from the start, as the E2E seed stores it. Synthetic credentials only; the
log never carries a password or a token.
"""

import json
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_ACCOUNTS = Path(__file__).with_name('accounts.json')
SEED_TOKEN_LIFETIME = 7 * 24 * 3600


class Directory:
    def __init__(self, accounts: list[dict]) -> None:
        self.lock = threading.Lock()
        self.by_email = {a['email'].lower(): dict(a) for a in accounts}
        self.tokens: dict[str, tuple[dict, float]] = {}
        now = time.time()
        for account in self.by_email.values():
            seed = account.get('seedToken')
            if seed:
                self.tokens[seed] = (account, now + SEED_TOKEN_LIFETIME)

    def sign_in(self, email: str, password: str) -> dict | None:
        with self.lock:
            account = self.by_email.get(str(email).lower())
            if account is None or account['password'] != password:
                return None
            expires = account['expiresIn']
            if isinstance(expires, list):
                expires_in = expires[0]
                if len(expires) > 1:
                    account['expiresIn'] = expires[1:]
            else:
                expires_in = expires
            token = secrets.token_hex(16)
            self.tokens[token] = (account, time.time() + int(expires_in))
            return {
                'data': {
                    'user': {
                        'id': account['id'],
                        'email': account['email'],
                        'name': account.get('name'),
                        'username': account.get('username'),
                        'emailVerified': account.get('emailVerified', True),
                    },
                    'token': {
                        'accessToken': token,
                        'expiresIn': int(expires_in),
                    },
                }
            }

    def profile(self, token: str) -> dict | None:
        with self.lock:
            entry = self.tokens.get(token)
            if entry is None or entry[1] <= time.time():
                return None
            account = entry[0]
            return {
                'data': {
                    'user': {
                        'id': account['id'],
                        'email': account['email'],
                        'membership': account.get('membership'),
                        'github': None,
                        'hasPassword': True,
                        'authProviders': ['credential'],
                    }
                }
            }


def make_handler(directory: Directory) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:
            # Method and path only: never a body, a header or a token.
            sys.stderr.write(f'stub {self.command} {self.path.split("?")[0]}\n')

        def _send(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path == '/health':
                self._send(200, {'status': 'ok'})
                return
            if self.path != '/api/users/profile':
                self._send(404, {'error': 'not found'})
                return
            auth = self.headers.get('Authorization', '')
            scheme, _, token = auth.partition(' ')
            body = (
                directory.profile(token.strip())
                if scheme.lower() == 'bearer'
                else None
            )
            if body is None:
                self._send(401, {'error': 'unauthorized'})
                return
            self._send(200, body)

        def do_POST(self) -> None:
            if self.path != '/api/auth/signin':
                self._send(404, {'error': 'not found'})
                return
            length = int(self.headers.get('Content-Length') or 0)
            try:
                payload = json.loads(self.rfile.read(length) or b'{}')
            except ValueError:
                self._send(400, {'error': 'bad request'})
                return
            body = directory.sign_in(
                payload.get('email', ''), payload.get('password', '')
            )
            if body is None:
                self._send(401, {'error': 'Invalid email or password'})
                return
            self._send(200, body)

    return Handler


def load_accounts(path: Path) -> list[dict]:
    return json.loads(path.read_text())['accounts']


def serve(path: Path, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(
        ('0.0.0.0', port), make_handler(Directory(load_accounts(path)))
    )
    return server


def main(argv: list[str]) -> None:
    path = DEFAULT_ACCOUNTS
    port = 8081
    args = list(argv)
    if '--port' in args:
        index = args.index('--port')
        port = int(args[index + 1])
        del args[index : index + 2]
    if args:
        path = Path(args[0])
    server = serve(path, port)
    sys.stderr.write(f'Borderless stub on port {port}\n')
    server.serve_forever()


if __name__ == '__main__':
    main(sys.argv[1:])
