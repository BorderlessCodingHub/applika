import httpx
import pytest

from applika.lib import device_flow
from applika.lib.api import ApiError
from applika.lib.device_flow import (
    DENIED_MESSAGE,
    DEVICE_CODE_GRANT,
    EXPIRED_MESSAGE,
    DeviceCode,
    DeviceFlowError,
)

TOKEN = {
    'access_token': 'new-access',
    'token_type': 'Bearer',
    'expires_in': 900,
    'refresh_token': 'new-refresh',
    'refresh_expires_in': 604800,
}


class Clock:
    def __init__(self):
        self.now = 0.0
        self.waits: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)
        self.now += seconds

    def monotonic(self) -> float:
        return self.now


def _oauth(error: str) -> httpx.Response:
    return httpx.Response(400, json={'error': error, 'detail': error})


def _code(interval: int = 10, expires_in: int = 600) -> DeviceCode:
    return DeviceCode(
        device_code='dev-code',
        user_code='ABCD-EFGH',
        verification_uri='http://web/devices/approve',
        verification_uri_complete='http://web/devices/approve?code=ABCD-EFGH',
        expires_in=expires_in,
        interval=interval,
    )


def _run(answers, code=None):
    """Polls with ``answers`` (responses or exceptions) in order; returns
    (result or raised exception, clock, request bodies)."""
    bodies = []
    queue = list(answers)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/auth/token'
        bodies.append(request.read())
        answer = queue.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    clock = Clock()
    client = httpx.Client(
        base_url='http://api/api', transport=httpx.MockTransport(handler)
    )
    with client:
        result = device_flow.poll(
            client,
            code or _code(),
            sleep=clock.sleep,
            monotonic=clock.monotonic,
        )
    return result, clock, bodies


def test_start_sends_device_name_and_reads_the_code():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['path'] = request.url.path
        captured['body'] = request.read()
        return httpx.Response(
            200,
            json={
                'device_code': 'dev-code',
                'user_code': 'ABCD-EFGH',
                'verification_uri': 'http://web/devices/approve',
                'verification_uri_complete': 'http://web/x?code=ABCD-EFGH',
                'expires_in': 600,
                'interval': 10,
            },
        )

    with httpx.Client(
        base_url='http://api/api', transport=httpx.MockTransport(handler)
    ) as client:
        code = device_flow.start(client, 'my-box')

    assert captured['path'] == '/api/auth/device/code'
    assert captured['body'] == b'{"device_name":"my-box"}'
    assert code.user_code == 'ABCD-EFGH'
    assert code.interval == 10
    assert code.expires_in == 600


def test_start_failure_raises_api_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            503,
            json={'detail': 'Session service unavailable'},
            headers={'retry-after': '5'},
        )

    with httpx.Client(
        base_url='http://api/api', transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(ApiError) as excinfo:
            device_flow.start(client, 'my-box')

    assert excinfo.value.status_code == 503


def test_pending_keeps_polling_at_interval_then_returns_the_token():
    result, clock, bodies = _run([
        _oauth('authorization_pending'),
        _oauth('authorization_pending'),
        httpx.Response(200, json=TOKEN),
    ])

    assert result == TOKEN
    assert clock.waits == [10, 10, 10]
    assert len(bodies) == 3
    assert DEVICE_CODE_GRANT.encode() in bodies[0]
    assert b'"device_code":"dev-code"' in bodies[0]


def test_slow_down_adds_five_seconds_for_good():
    result, clock, _ = _run([
        _oauth('slow_down'),
        _oauth('authorization_pending'),
        _oauth('slow_down'),
        httpx.Response(200, json=TOKEN),
    ])

    assert result == TOKEN
    assert clock.waits == [10, 15, 15, 20]


def test_429_waits_retry_after_then_back_to_interval():
    result, clock, _ = _run([
        httpx.Response(
            429, json={'detail': 'slow'}, headers={'retry-after': '30'}
        ),
        httpx.Response(200, json=TOKEN),
    ])

    assert result == TOKEN
    assert clock.waits == [10, 30]


def test_retry_after_shorter_than_interval_never_polls_faster():
    _, clock, _ = _run([
        httpx.Response(
            429, json={'detail': 'slow'}, headers={'retry-after': '2'}
        ),
        httpx.Response(200, json=TOKEN),
    ])

    assert clock.waits == [10, 10]


def test_503_without_retry_after_waits_the_default_five_seconds():
    _, clock, _ = _run(
        [
            httpx.Response(503, json={'detail': 'Session service unavailable'}),
            httpx.Response(200, json=TOKEN),
        ],
        code=_code(interval=1),
    )

    assert clock.waits == [1, 5]


def test_network_error_waits_interval_and_keeps_polling():
    result, clock, _ = _run([
        httpx.ConnectError('down'),
        httpx.Response(200, json=TOKEN),
    ])

    assert result == TOKEN
    assert clock.waits == [10, 10]


def test_expired_token_exits_with_run_login_again():
    with pytest.raises(DeviceFlowError) as excinfo:
        _run([_oauth('authorization_pending'), _oauth('expired_token')])

    assert str(excinfo.value) == EXPIRED_MESSAGE
    assert 'applika login --device' in EXPIRED_MESSAGE


def test_access_denied_exits_with_denied_message():
    with pytest.raises(DeviceFlowError) as excinfo:
        _run([_oauth('access_denied')])

    assert str(excinfo.value) == DENIED_MESSAGE
    assert 'denied' in DENIED_MESSAGE


def test_stops_locally_once_expires_in_has_elapsed():
    answers = [_oauth('authorization_pending')] * 10
    with pytest.raises(DeviceFlowError) as excinfo:
        _run(answers, code=_code(interval=10, expires_in=25))

    assert str(excinfo.value) == EXPIRED_MESSAGE


def test_local_expiry_polls_at_t10_and_t20_only():
    bodies_seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies_seen.append(1)
        return _oauth('authorization_pending')

    clock = Clock()
    with httpx.Client(
        base_url='http://api/api', transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(DeviceFlowError):
            device_flow.poll(
                client,
                _code(interval=10, expires_in=25),
                sleep=clock.sleep,
                monotonic=clock.monotonic,
            )

    assert len(bodies_seen) == 2
    assert clock.waits == [10, 10, 10]


def test_unknown_oauth_error_raises_api_error():
    with pytest.raises(ApiError) as excinfo:
        _run([_oauth('invalid_grant')])

    assert excinfo.value.status_code == 400
