"""Unit tests for app/application/validators/discord_webhook.py (T120).

KODI-025, plan corrections: Snowflake overflow must be a 422
(``BusinessRuleViolation``), never an unhandled ``OverflowError``/500, and no
error message may ever contain the submitted URL, id or label.
"""

import pytest

from app.application.validators.discord_webhook import (
    BIGINT_MAX,
    INVALID_GUILD_ID,
    INVALID_ROLE_ID,
    INVALID_WEBHOOK_URL,
    LABEL_TOO_LONG,
    TOO_MANY_ROLE_IDS,
    mask,
    validate_guild_id,
    validate_label,
    validate_role_ids,
    validate_webhook_url,
)
from app.core.exceptions import BusinessRuleViolation

VALID_ID = '123456789012345678'  # 18 digits
VALID_TOKEN = 'AbCdEfGhIjKlMnOpQrSt0123456789'  # >= 20 chars
VALID_URL = f'https://discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}'
OVERFLOW_ID = '92233720368547758080'  # 20 digits, > int64 max


# ── webhook_url ──────────────────────────────────────────────────


@pytest.mark.parametrize(
    'url',
    [
        VALID_URL,
        f'https://discordapp.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}',
        f'https://ptb.discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}',
        f'https://canary.discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}',
        f'https://discord.com/api/v10/webhooks/{VALID_ID}/{VALID_TOKEN}',
    ],
)
def test_validate_webhook_url_accepts_every_documented_host_variant(url):
    assert validate_webhook_url(url) == url


@pytest.mark.parametrize(
    'url',
    [
        # http, not https
        f'http://discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}',
        # wrong host
        f'https://evil.example.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}',
        # wrong path
        f'https://discord.com/webhooks/{VALID_ID}/{VALID_TOKEN}',
        # webhook id too short
        f'https://discord.com/api/webhooks/12345/{VALID_TOKEN}',
        # token too short
        f'https://discord.com/api/webhooks/{VALID_ID}/short',
        # not a string
        None,
        # empty string
        '',
    ],
)
def test_validate_webhook_url_refuses_everything_else(url):
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_webhook_url(url)
    assert str(excinfo.value) == INVALID_WEBHOOK_URL
    # the fixed message never contains the value under test
    if url:
        assert url not in str(excinfo.value)


def test_validate_webhook_url_refuses_bigint_overflow_with_422_not_500():
    """Plan correction: a 17-20 digit id can still exceed BIGINT; this must
    be a clean ``BusinessRuleViolation`` (422), never an unhandled crash."""
    overflow_url = (
        f'https://discord.com/api/webhooks/{OVERFLOW_ID}/{VALID_TOKEN}'
    )
    assert int(OVERFLOW_ID) > BIGINT_MAX
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_webhook_url(overflow_url)
    assert str(excinfo.value) == INVALID_WEBHOOK_URL
    assert overflow_url not in str(excinfo.value)


# ── guild_id / role_ids (snowflake ids) ─────────────────────────


def test_validate_guild_id_accepts_a_valid_snowflake_string():
    assert validate_guild_id(VALID_ID) == int(VALID_ID)


@pytest.mark.parametrize(
    'value', [None, '', 'not-a-number', '123', OVERFLOW_ID]
)
def test_validate_guild_id_refuses_bad_or_overflowing_ids(value):
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_guild_id(value)
    assert str(excinfo.value) == INVALID_GUILD_ID


def test_validate_role_ids_empty_or_none_returns_empty_list():
    assert validate_role_ids(None) == []
    assert validate_role_ids([]) == []


def test_validate_role_ids_dedupes_preserving_order():
    other_id = '223456789012345678'
    result = validate_role_ids([VALID_ID, other_id, VALID_ID])
    assert result == [int(VALID_ID), int(other_id)]


def test_validate_role_ids_refuses_more_than_25_distinct_ids():
    ids = [str(100000000000000000 + i) for i in range(26)]
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_role_ids(ids)
    assert str(excinfo.value) == TOO_MANY_ROLE_IDS


def test_validate_role_ids_25_distinct_ids_is_accepted():
    ids = [str(100000000000000000 + i) for i in range(25)]
    result = validate_role_ids(ids)
    assert len(result) == 25


def test_validate_role_ids_refuses_a_malformed_id():
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_role_ids(['not-a-snowflake'])
    assert str(excinfo.value) == INVALID_ROLE_ID


# ── label ────────────────────────────────────────────────────────


def test_validate_label_accepts_none_and_short_labels():
    assert validate_label(None) is None
    assert validate_label('Community reports') == 'Community reports'


def test_validate_label_refuses_more_than_100_chars():
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_label('x' * 101)
    assert str(excinfo.value) == LABEL_TOO_LONG


# ── mask ─────────────────────────────────────────────────────────


def test_mask_shows_only_the_webhook_id_and_last_4_token_chars():
    masked = mask(VALID_URL)
    assert masked == (
        f'https://discord.com/api/webhooks/{VALID_ID}/…{VALID_TOKEN[-4:]}'
    )
    assert VALID_TOKEN[:-4] not in masked


def test_mask_normalizes_host_variants_to_plain_discord_com():
    url = f'https://ptb.discordapp.com/api/v9/webhooks/{VALID_ID}/{VALID_TOKEN}'
    masked = mask(url)
    assert masked.startswith('https://discord.com/api/webhooks/')
    assert 'ptb' not in masked
