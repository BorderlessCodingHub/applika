"""Drive a Borderless OpenID Connect sign-in end to end in a test
(ADR-0026 §2, §3): applika's ``/auth/borderless/login`` (or a CLI entry
point) → the fake Borderless's sign-in page → its callback on applika.

``api`` is the test's client on the applika app (``real_client``: its
cookie jar is the browser's applika side); ``browser`` is a client on the
fake's transport (its cookie jar holds the fake's ``fake_bl_session``).
Nothing here reaches the real Borderless.
"""

from urllib.parse import parse_qs, urlsplit

import httpx

from tests.fixtures.borderless.fake_oidc import FakeBorderless

CALLBACK_PATH = '/auth/borderless/callback'


def fake_browser(fake: FakeBorderless) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=fake.transport())


def query_of(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}


async def at_borderless(
    browser: httpx.AsyncClient, authorize_url: str, sub: str | None
) -> httpx.Response:
    """The browser at Borderless: the sign-in page, then (when it shows a
    form) the one-click account ``sub``. Answers Borderless's redirect
    back to applika."""
    page = await browser.get(authorize_url)
    if page.status_code != 200:
        return page  # a session went straight back, or a refusal
    assert sub is not None, 'Borderless asked for an account'
    params = query_of(authorize_url)
    return await browser.post(
        authorize_url.split('?', 1)[0], data={**params, 'account': sub}
    )


async def return_to_applika(
    api: httpx.AsyncClient,
    borderless_answer: httpx.Response,
    *,
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
) -> httpx.Response:
    """Follow Borderless's redirect to applika's callback (with the
    ``__borderless_login`` cookie the api client holds)."""
    location = borderless_answer.headers['location']
    assert urlsplit(location).path.endswith('/api' + CALLBACK_PATH), location
    return await api.get(
        CALLBACK_PATH,
        params=query_of(location),
        headers=headers,
        cookies=cookies,
    )


async def borderless_sign_in(
    api: httpx.AsyncClient,
    browser: httpx.AsyncClient,
    sub: str | None,
    *,
    start: str = '/auth/borderless/login',
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
) -> httpx.Response:
    """The whole round trip; answers applika's callback response (a 307).
    ``headers`` and ``cookies`` ride the callback request (the browser's
    user agent, an applika cookie it already holds)."""
    begin = await api.get(start, params=params)
    assert begin.status_code == 307, begin.text
    answer = await at_borderless(browser, begin.headers['location'], sub)
    assert answer.status_code in (302, 303), answer.text
    return await return_to_applika(
        api, answer, headers=headers, cookies=cookies
    )
