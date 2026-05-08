from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread
from urllib.parse import parse_qs, urlparse


@dataclass
class CallbackResult:
    code: str | None = None
    state: str | None = None
    error: str | None = None
    ready: Event = field(default_factory=Event)


class LoopbackLoginServer:
    def __init__(self, expected_state: str):
        self.expected_state = expected_state
        self.result = CallbackResult()
        self._server = ThreadingHTTPServer(('127.0.0.1', 0), self._handler())
        self._thread = Thread(
            target=self._server.serve_forever,
            daemon=True,
        )

    @property
    def callback_url(self) -> str:
        host, port = self._server.server_address
        return f'http://{host}:{port}/callback'

    def _handler(self):
        result = self.result
        expected_state = self.expected_state

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                params = parse_qs(parsed.query)
                code = params.get('code', [None])[0]
                state = params.get('state', [None])[0]
                if parsed.path != '/callback':
                    self.send_response(404)
                    self.end_headers()
                    return
                if state != expected_state:
                    result.error = 'Login state mismatch'
                    body = b'<html><body>Authentication failed. State mismatch.</body></html>'
                    self.send_response(400)
                elif not code:
                    result.error = 'Missing authorization code'
                    body = b'<html><body>Authentication failed. Missing code.</body></html>'
                    self.send_response(400)
                else:
                    result.code = code
                    result.state = state
                    body = b'<html><body>Authentication complete. You can close this window.</body></html>'
                    self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                result.ready.set()

            def log_message(self, fmt, *args):
                return

        return Handler

    def start(self) -> None:
        self._thread.start()

    def wait_for_code(self, timeout_seconds: int) -> str:
        if not self.result.ready.wait(timeout_seconds):
            raise RuntimeError('Timed out waiting for browser login')
        if self.result.error:
            raise RuntimeError(self.result.error)
        if not self.result.code:
            raise RuntimeError('Missing authorization code')
        return self.result.code

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
