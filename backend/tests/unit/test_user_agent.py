"""``describe_user_agent`` (KODI-057, R-009, R-020)."""

import pytest

from app.core.user_agent import OLDER_CLI, UNKNOWN_DEVICE, describe_user_agent

CHROME_MAC = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
)
EDGE_WINDOWS = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
)
OPERA_LINUX = (
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0'
)
FIREFOX_LINUX = (
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 '
    'Firefox/131.0'
)
SAFARI_IPHONE = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 '
    'Safari/604.1'
)
SAFARI_MAC = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.6 Safari/605.1.15'
)
CHROME_ANDROID = (
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
)
CHROME_OS = (
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
)


@pytest.mark.parametrize(
    ('user_agent', 'label'),
    [
        (CHROME_MAC, 'Chrome on macOS'),
        (EDGE_WINDOWS, 'Edge on Windows'),
        (OPERA_LINUX, 'Opera on Linux'),
        (FIREFOX_LINUX, 'Firefox on Linux'),
        (SAFARI_IPHONE, 'Safari on iOS'),
        (SAFARI_MAC, 'Safari on macOS'),
        (CHROME_ANDROID, 'Chrome on Android'),
        (CHROME_OS, 'Chrome on ChromeOS'),
    ],
)
def test_browser_on_system(user_agent, label):
    assert describe_user_agent(user_agent) == label


def test_new_cli_names_its_version():
    ua = 'applika-cli/1.1.0 (Linux; Python 3.12)'
    assert describe_user_agent(ua) == 'applika-cli 1.1.0'


def test_installed_cli_sends_the_httpx_agent():
    """CLIs 0.1.4 to 1.0.1 send httpx's default agent."""
    assert describe_user_agent('python-httpx/0.28.1') == OLDER_CLI
    assert OLDER_CLI == 'applika-cli (older version)'


@pytest.mark.parametrize('user_agent', [None, '', '   '])
def test_no_agent_is_an_unknown_device(user_agent):
    assert describe_user_agent(user_agent) == UNKNOWN_DEVICE


def test_unknown_browser_on_a_known_system():
    assert describe_user_agent('SomeBot (Windows NT 10.0)') == (
        'Browser on Windows'
    )


def test_known_browser_on_an_unknown_system():
    assert describe_user_agent('Firefox/131.0') == 'Firefox'


def test_nothing_recognised():
    assert describe_user_agent('curl/8.5.0') == UNKNOWN_DEVICE
