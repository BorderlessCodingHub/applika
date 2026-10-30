"""Unit tests for app/application/validators/report_webhook.py.

A webhook id overflow must be a 422 (``BusinessRuleViolation``), never an
unhandled 500, and no error message may ever contain the submitted URL or
label. A webhook holds one or more distinct badges, BASE or PSP, never none.
"""

import json
from pathlib import Path

import pytest

from app.application.validators.report_webhook import (
    BADGES_REQUIRED,
    BIGINT_MAX,
    DUPLICATE_BADGE,
    INVALID_BADGE,
    INVALID_WEBHOOK_URL,
    LABEL_TOO_LONG,
    mask,
    validate_badge,
    validate_badges,
    validate_label,
    validate_webhook_url,
)
from app.core.enums import BadgeKey
from app.core.exceptions import BusinessRuleViolation

VALID_ID = '123456789012345678'  # 18 digits
VALID_TOKEN = 'AbCdEfGhIjKlMnOpQrSt0123456789'  # >= 20 chars
VALID_URL = f'https://discord.com/api/webhooks/{VALID_ID}/{VALID_TOKEN}'
OVERFLOW_ID = '92233720368547758080'  # 20 digits, > int64 max

#: The URL cases the web's ``isValidWebhookUrl`` must agree on; its own suite
#: (``webhook-url-parity.test.ts``) reads the same file, so a pattern change
#: on one side alone fails a test.
URL_CASES = json.loads(
    (
        Path(__file__).parents[1] / 'fixtures' / 'report-webhook-urls.json'
    ).read_text(encoding='utf-8')
)


# ── webhook_url ──────────────────────────────────────────────────


@pytest.mark.parametrize('url', [case['url'] for case in URL_CASES['accept']])
def test_validate_webhook_url_accepts_every_documented_host_variant(url):
    assert validate_webhook_url(url) == url


@pytest.mark.parametrize(
    'url',
    # not a string, then every string case the web must refuse too
    [None, *(case['url'] for case in URL_CASES['refuse'])],
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


# ── badge ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ('value', 'expected'),
    [
        ('borderless_base', BadgeKey.BORDERLESS_BASE),
        ('borderless_psp', BadgeKey.BORDERLESS_PSP),
        ('BASE', BadgeKey.BORDERLESS_BASE),
        (' psp ', BadgeKey.BORDERLESS_PSP),
    ],
)
def test_validate_badge_accepts_base_and_psp(value, expected):
    assert validate_badge(value) is expected


@pytest.mark.parametrize('value', [None, '', 'free', 'admin', 3])
def test_validate_badge_refuses_anything_else_including_null(value):
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_badge(value)
    assert excinfo.value.message == INVALID_BADGE


@pytest.mark.parametrize(
    ('value', 'expected'),
    [
        (['borderless_base'], ['borderless_base']),
        (['PSP'], ['borderless_psp']),
        (['psp', 'base'], ['borderless_base', 'borderless_psp']),
        (
            ['borderless_base', 'borderless_psp'],
            ['borderless_base', 'borderless_psp'],
        ),
    ],
)
def test_validate_badges_accepts_one_or_both(value, expected):
    assert validate_badges(value) == expected


@pytest.mark.parametrize('value', [None, [], 'base', {'base': 1}, 3])
def test_validate_badges_refuses_none_or_empty(value):
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_badges(value)
    assert excinfo.value.message == BADGES_REQUIRED


@pytest.mark.parametrize(
    'value', [['base', 'free'], ['admin'], [None], ['borderless_psp', 3]]
)
def test_validate_badges_refuses_an_unknown_badge(value):
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_badges(value)
    assert excinfo.value.message == INVALID_BADGE


@pytest.mark.parametrize(
    'value',
    [['base', 'base'], ['PSP', 'borderless_psp'], ['base', 'psp', 'BASE']],
)
def test_validate_badges_refuses_a_duplicate(value):
    with pytest.raises(BusinessRuleViolation) as excinfo:
        validate_badges(value)
    assert excinfo.value.message == DUPLICATE_BADGE


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
