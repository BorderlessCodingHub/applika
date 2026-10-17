"""A short, human label for a device from its ``User-Agent`` (KODI-057).

Regex only, no dependency: "Chrome on macOS", "applika-cli 1.1.0", and
"applika-cli (older version)" for the httpx agent that installed CLIs
0.1.4 to 1.0.1 send.
"""

import re

UNKNOWN_DEVICE = 'Unknown device'
OLDER_CLI = 'applika-cli (older version)'

_CLI_RE = re.compile(r'applika-cli/(\d+(?:\.\d+)*)', re.IGNORECASE)
_HTTPX_RE = re.compile(r'python-httpx/', re.IGNORECASE)

# First match wins: Edge and Opera also say "Chrome", Chrome also says
# "Safari".
_BROWSERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ('Edge', re.compile(r'Edg(?:e|A|iOS)?/')),
    ('Opera', re.compile(r'OPR/|Opera')),
    ('Firefox', re.compile(r'Firefox/|FxiOS/')),
    ('Chrome', re.compile(r'Chrome/|CriOS/')),
    ('Safari', re.compile(r'Version/[\d.]+.*Safari/')),
)

# iOS and Android before macOS and Linux: an iPhone says "like Mac OS X",
# an Android phone says "Linux".
_SYSTEMS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ('iOS', re.compile(r'iPhone|iPad|iPod')),
    ('Android', re.compile(r'Android')),
    ('ChromeOS', re.compile(r'CrOS')),
    ('Windows', re.compile(r'Windows')),
    ('macOS', re.compile(r'Macintosh|Mac OS X')),
    ('Linux', re.compile(r'Linux')),
)


def _first(
    patterns: tuple[tuple[str, re.Pattern[str]], ...], user_agent: str
) -> str | None:
    for name, pattern in patterns:
        if pattern.search(user_agent):
            return name
    return None


def describe_user_agent(user_agent: str | None) -> str:
    if not user_agent or not user_agent.strip():
        return UNKNOWN_DEVICE

    cli = _CLI_RE.search(user_agent)
    if cli:
        return f'applika-cli {cli.group(1)}'
    if _HTTPX_RE.search(user_agent):
        return OLDER_CLI

    browser = _first(_BROWSERS, user_agent)
    system = _first(_SYSTEMS, user_agent)
    if browser and system:
        return f'{browser} on {system}'
    if browser:
        return browser
    if system:
        return f'Browser on {system}'
    return UNKNOWN_DEVICE
