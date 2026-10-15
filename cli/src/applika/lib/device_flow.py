"""Device code sign-in (RFC 8628) for `applika login --device` (KODI-060).

``start`` asks ``POST /auth/device/code`` for a short user code; ``poll``
asks ``POST /auth/token`` with the device code grant every ``interval``
seconds until the user approves or denies it in a signed-in browser, or
the code expires. Sleep and clock are parameters so tests never wait.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from applika.lib.api import (
    TRANSIENT_STATUSES,
    ApiError,
    error_detail,
    retry_after_seconds,
)

DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
SLOW_DOWN_STEP_SECONDS = 5
# A proxy answering while the API restarts: treated like a network error.
GATEWAY_STATUSES = (502, 504)
EXPIRED_MESSAGE = (
    'The device code expired before it was approved. '
    'Run `applika login --device` again.'
)
DENIED_MESSAGE = 'The sign-in was denied in the browser.'


class DeviceFlowError(RuntimeError):
    """The device sign-in ended without a session (exit 1)."""


@dataclass
class DeviceCode:
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int


def start(client: httpx.Client, device_name: str) -> DeviceCode:
    response = client.post(
        '/auth/device/code', json={'device_name': device_name}
    )
    if response.status_code != 200:
        raise ApiError(error_detail(response), response.status_code)
    data = response.json()
    return DeviceCode(
        device_code=data['device_code'],
        user_code=data['user_code'],
        verification_uri=data['verification_uri'],
        verification_uri_complete=data['verification_uri_complete'],
        expires_in=int(data['expires_in']),
        interval=max(1, int(data['interval'])),
    )


def poll(
    client: httpx.Client,
    code: DeviceCode,
    *,
    sleep: Callable[[float], None] | None = None,
    monotonic: Callable[[], float] | None = None,
) -> dict[str, Any]:
    """Poll until a token answer; returns its JSON body.

    - ``authorization_pending``: keep polling at ``interval``.
    - ``slow_down``: ``interval`` grows by 5 seconds for good.
    - 429/503: wait ``Retry-After`` (default 5 s, never less than
      ``interval``) and keep polling.
    - a network error, 502 or 504: wait ``interval`` and keep polling.
    - ``expired_token``, or ``expires_in`` elapsed here: ``DeviceFlowError``.
    - ``access_denied``: ``DeviceFlowError``.
    """
    sleep = sleep or time.sleep
    monotonic = monotonic or time.monotonic
    deadline = monotonic() + code.expires_in
    interval = code.interval
    wait = interval
    while True:
        sleep(wait)
        if monotonic() >= deadline:
            raise DeviceFlowError(EXPIRED_MESSAGE)
        wait = interval
        try:
            response = client.post(
                '/auth/token',
                json={
                    'grant_type': DEVICE_CODE_GRANT,
                    'device_code': code.device_code,
                },
            )
        except httpx.TransportError:
            continue
        if response.status_code == 200:
            return response.json()
        if response.status_code in GATEWAY_STATUSES:
            continue
        if response.status_code in TRANSIENT_STATUSES:
            wait = max(interval, retry_after_seconds(response))
            continue
        error = _oauth_error(response)
        if error == 'authorization_pending':
            continue
        if error == 'slow_down':
            interval += SLOW_DOWN_STEP_SECONDS
            wait = interval
            continue
        if error == 'expired_token':
            raise DeviceFlowError(EXPIRED_MESSAGE)
        if error == 'access_denied':
            raise DeviceFlowError(DENIED_MESSAGE)
        raise ApiError(error_detail(response), response.status_code)


def _oauth_error(response: httpx.Response) -> str | None:
    if response.status_code != 400:
        return None
    try:
        data = response.json()
    except ValueError:
        return None
    return data.get('error') if isinstance(data, dict) else None
