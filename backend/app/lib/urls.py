"""URL normalization utilities for company profile URLs.

For job platforms that host company profiles (LinkedIn, Indeed, Wellfound,
AngelList), only the canonical profile base path is kept — sub-pages and
query strings are stripped. For all other domains only the scheme + host
is kept (no path, no query, no fragment).
"""

import re
from urllib.parse import urlparse

# Platforms that have a predictable company-profile path segment.
# Each entry: (apex_domain, compiled_regex).
# The regex captures only the canonical profile prefix.
_PROFILE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # https://www.linkedin.com/company/<slug>/anything?q=1
    # → https://www.linkedin.com/company/<slug>
    (
        'linkedin.com',
        re.compile(
            r'(https?://(?:www\.)?linkedin\.com/company/[^/?#\s]+)',
            re.IGNORECASE,
        ),
    ),
    # https://www.indeed.com/cmp/<slug>/reviews?period=1
    # → https://www.indeed.com/cmp/<slug>
    (
        'indeed.com',
        re.compile(
            r'(https?://(?:www\.)?indeed\.com/cmp/[^/?#\s]+)',
            re.IGNORECASE,
        ),
    ),
    # https://wellfound.com/company/<slug>/jobs
    # → https://wellfound.com/company/<slug>
    (
        'wellfound.com',
        re.compile(
            r'(https?://(?:www\.)?wellfound\.com/company/[^/?#\s]+)',
            re.IGNORECASE,
        ),
    ),
    # https://angel.co/company/<slug>/jobs  (legacy AngelList)
    # → https://angel.co/company/<slug>
    (
        'angel.co',
        re.compile(
            r'(https?://(?:www\.)?angel\.co/company/[^/?#\s]+)',
            re.IGNORECASE,
        ),
    ),
]


def normalize_company_url(url: str) -> str:
    """Return the canonical storage form of a company URL.

    Known job/talent platforms with company profiles: the URL is trimmed
    to the profile base path (scheme + host + profile-prefix + slug).

    All other URLs: only scheme + host is kept.
    """
    parsed = urlparse(url)
    hostname = (parsed.hostname or '').lower()

    for domain, pattern in _PROFILE_PATTERNS:
        if hostname == domain or hostname.endswith(f'.{domain}'):
            match = pattern.match(url)
            if match:
                return match.group(1)
            # Domain matched but path didn't fit the profile pattern
            # (e.g. a LinkedIn jobs search page) — fall through to default
            break

    return f'{parsed.scheme}://{parsed.netloc}'
