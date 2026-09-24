"""Validation for admin report webhooks (KODI-025, ADR-0013, T113).

Every raised error is a fixed string - never the submitted URL, id or
label - so a 422 from these routes never leaks the webhook address
(AC2/AC3/R-030, ``.claude/rules`` "no response, log or error carries a full
URL").
"""

import re

from app.core.exceptions import BusinessRuleViolation

#: Postgres BIGINT upper bound. A 20-digit numeric string can already
#: overflow it; without this check a valid-looking id would hit an
#: ``OverflowError``/DB error (500) instead of a clean 422 (plan correction).
BIGINT_MAX = 9223372036854775807

MAX_ROLE_IDS = 25
MAX_LABEL_LENGTH = 100

#: ``re.ASCII`` is load-bearing here (backend-qa finding B2): without it
#: ``\d`` and ``\w`` also match non-ASCII digit/letter code points (e.g.
#: Arabic-Indic digits), which ``int()`` silently normalizes to their ASCII
#: value - a non-ASCII "digit" id would otherwise pass validation and reach
#: the database. ``fullmatch`` (rather than ``match`` + a trailing ``$``) is
#: used instead of ``match``/``$`` so a trailing ``\n`` can never sneak past
#: the anchor - ``$`` alone matches immediately before a final newline.
WEBHOOK_URL_RE = re.compile(
    r'https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com'
    r'/api(?:/v\d+)?/webhooks/(\d{17,20})/([\w-]{20,})',
    re.ASCII,
)
SNOWFLAKE_RE = re.compile(r'\d{17,20}', re.ASCII)

INVALID_WEBHOOK_URL = 'Invalid Discord webhook URL'
INVALID_GUILD_ID = 'Invalid Discord server id'
INVALID_ROLE_ID = 'Invalid Discord role id'
TOO_MANY_ROLE_IDS = f'A webhook may hold at most {MAX_ROLE_IDS} role ids'
LABEL_TOO_LONG = f'Label must be at most {MAX_LABEL_LENGTH} characters'


def validate_webhook_url(value: str | None) -> str:
    """Require a secure Discord webhook address (AC2).

    Accepts ``discord.com``/``discordapp.com``, the ``ptb``/``canary``
    subdomains, an optional ``/v<n>`` API version segment, and refuses every
    other host or scheme (``http://`` included). The 17-20 digit webhook id
    is additionally checked against the Postgres BIGINT bound, and the token
    segment is required to be at least 20 URL-safe characters - short of
    that it is not read as a genuine webhook token.
    """
    if not isinstance(value, str) or not value:
        raise BusinessRuleViolation(INVALID_WEBHOOK_URL)
    match = WEBHOOK_URL_RE.fullmatch(value)
    if not match:
        raise BusinessRuleViolation(INVALID_WEBHOOK_URL)
    if int(match.group(1)) > BIGINT_MAX:
        raise BusinessRuleViolation(INVALID_WEBHOOK_URL)
    return value


def _validate_snowflake(value: str, error_message: str) -> int:
    if not isinstance(value, str) or not SNOWFLAKE_RE.fullmatch(value):
        raise BusinessRuleViolation(error_message)
    int_value = int(value)
    if int_value > BIGINT_MAX:
        raise BusinessRuleViolation(error_message)
    return int_value


def validate_guild_id(value: str | None) -> int:
    if value is None:
        raise BusinessRuleViolation(INVALID_GUILD_ID)
    return _validate_snowflake(value, INVALID_GUILD_ID)


def validate_role_ids(values: list[str] | None) -> list[int]:
    """<=25 Discord role ids, deduped, order preserved (T113)."""
    if not values:
        return []
    seen: set[int] = set()
    deduped: list[int] = []
    for value in values:
        role_id = _validate_snowflake(value, INVALID_ROLE_ID)
        if role_id not in seen:
            seen.add(role_id)
            deduped.append(role_id)
    if len(deduped) > MAX_ROLE_IDS:
        raise BusinessRuleViolation(TOO_MANY_ROLE_IDS)
    return deduped


def validate_label(value: str | None) -> str | None:
    if value is None:
        return None
    if len(value) > MAX_LABEL_LENGTH:
        raise BusinessRuleViolation(LABEL_TOO_LONG)
    return value


def mask(url: str) -> str:
    """``https://discord.com/api/webhooks/<webhook_id>/...<last4>`` (AC3).

    Always normalizes to the plain ``discord.com`` host regardless of which
    accepted host/API-version variant the stored URL used - the masked form
    is a display value, not an echo of the stored address.
    """
    match = WEBHOOK_URL_RE.fullmatch(url)
    if not match:
        return 'https://discord.com/api/webhooks/…'
    webhook_id, token = match.group(1), match.group(2)
    return f'https://discord.com/api/webhooks/{webhook_id}/…{token[-4:]}'
