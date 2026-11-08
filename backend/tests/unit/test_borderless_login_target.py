"""Where a Borderless sign-in may end (ADR-0026 §3): the web sign-in page
for a web sign-in, the CLI login's own hand-off (its loopback callback, or
for ``oob`` the manual-code page) for a CLI one. ``begin`` stores that
target in the attempt; ``complete`` derives it again and refuses a record
naming anything else before any exchange."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.use_cases.borderless.begin_login import (
    BeginBorderlessLoginUseCase,
)
from app.application.use_cases.borderless.complete_login import (
    BorderlessLoginFailed,
    CompleteBorderlessLoginUseCase,
)
from app.application.use_cases.borderless.login_state import LoginRecord
from app.application.use_cases.borderless.login_target import (
    BorderlessLoginTargets,
)
from app.application.use_cases.cli_auth.callback_url import (
    cli_handoff_target,
)
from app.config.settings import envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import CodedRefusal

LOOPBACK = 'http://127.0.0.1:43129/callback'
EVIL = 'https://evil.example.test/steal'
MANUAL = 'https://web.example.test/cli/code'


@pytest.fixture(autouse=True)
def _manual_page(monkeypatch):
    monkeypatch.setattr(envs, 'CLI_MANUAL_REDIRECT_URI', MANUAL)


def _targets(login: dict | None) -> BorderlessLoginTargets:
    handoff = AsyncMock()
    handoff.get_login.return_value = login
    return BorderlessLoginTargets(handoff)


# --------------------------------------------------------------------------
# The allowed targets
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ('login', 'expected'),
    [
        ({'callback_url': LOOPBACK, 'state': 's'}, LOOPBACK),
        (
            {'callback_url': 'http://localhost:5000/cb', 'state': 's'},
            'http://localhost:5000/cb',
        ),
        ({'callback_url': LOOPBACK, 'flow': 'pkce'}, LOOPBACK),
        ({'callback_url': 'oob', 'flow': 'pkce'}, MANUAL),
        # ``oob`` is a PKCE login's only; a legacy login has a loopback.
        ({'callback_url': 'oob'}, None),
        ({'callback_url': EVIL, 'flow': 'pkce'}, None),
        ({'callback_url': 'https://127.0.0.1:43129/cb'}, None),
        ({'callback_url': 'http://127.0.0.1/cb'}, None),
        ({'callback_url': 'http://127.0.0.1:43129/cb#frag'}, None),
        ({'callback_url': 'http://127.0.0.1:999999/cb'}, None),
        ({'callback_url': None}, None),
        ({}, None),
    ],
)
def test_a_cli_login_allows_its_own_hand_off_only(login, expected):
    assert cli_handoff_target(login) == expected


async def test_a_web_sign_in_ends_on_the_web_sign_in_page():
    handoff = AsyncMock()
    targets = BorderlessLoginTargets(handoff)
    assert await targets.allowed('web', None) == envs.WEB_SIGNIN_URI
    handoff.get_login.assert_not_awaited()


async def test_a_cli_sign_in_ends_on_its_logins_hand_off():
    handoff = AsyncMock()
    handoff.get_login.return_value = {'callback_url': 'oob', 'flow': 'pkce'}
    targets = BorderlessLoginTargets(handoff)
    assert await targets.allowed('cli', 'login-1') == MANUAL
    handoff.get_login.assert_awaited_once_with('login-1')


async def test_a_cli_sign_in_without_its_login_ends_nowhere():
    assert await _targets(None).allowed('cli', 'gone') is None
    assert await _targets({'callback_url': LOOPBACK}).allowed('cli', None) is (
        None
    )


# --------------------------------------------------------------------------
# begin stores the target
# --------------------------------------------------------------------------


def _oidc() -> MagicMock:
    oidc = MagicMock()
    oidc.is_configured.return_value = True
    oidc.discovery = AsyncMock(return_value={'issuer': 'x'})
    oidc.authorize_url.return_value = 'https://borderless.test/authorize'
    return oidc


async def test_begin_stores_the_allowed_target_in_the_attempt():
    login_state = AsyncMock()
    login_state.create.return_value = SimpleNamespace(
        state='s', nonce='n', verifier='v' * 43, binding='b'
    )
    begin = BeginBorderlessLoginUseCase(
        _oidc(), login_state, _targets({'callback_url': LOOPBACK})
    )

    assert await begin.execute('cli', 'login-1') == (
        'https://borderless.test/authorize',
        'b',
    )
    login_state.create.assert_awaited_once_with(
        'cli', 'login-1', target=LOOPBACK
    )

    login_state.create.reset_mock()
    await BeginBorderlessLoginUseCase(
        _oidc(), login_state, _targets(None)
    ).execute('web')
    login_state.create.assert_awaited_once_with(
        'web', None, target=envs.WEB_SIGNIN_URI
    )


async def test_begin_refuses_a_cli_login_with_no_hand_off():
    login_state = AsyncMock()
    begin = BeginBorderlessLoginUseCase(
        _oidc(), login_state, _targets({'callback_url': EVIL})
    )

    with pytest.raises(CodedRefusal) as excinfo:
        await begin.execute('cli', 'login-1')

    assert excinfo.value.code == ErrorCode.AUTH_CLI_LOGIN_EXPIRED
    login_state.create.assert_not_awaited()


# --------------------------------------------------------------------------
# complete checks it again, before anything else happens
# --------------------------------------------------------------------------


def _complete(record: LoginRecord, login: dict | None):
    oidc = MagicMock()
    oidc.exchange = AsyncMock()
    login_state = AsyncMock()
    login_state.consume.return_value = record
    sign_in = AsyncMock()
    sign_in.execute.return_value = SimpleNamespace(user_id=7, new_account=False)
    use_case = CompleteBorderlessLoginUseCase(
        oidc, login_state, sign_in, _targets(login)
    )
    return use_case, oidc, sign_in


PARAMS = {'code': 'c', 'state': 's', 'iss': 'https://issuer.test'}


@pytest.fixture
def _issuer(monkeypatch):
    monkeypatch.setattr(envs, 'BORDERLESS_ISSUER', PARAMS['iss'])


@pytest.mark.parametrize(
    ('record', 'login', 'code', 'flow'),
    [
        (LoginRecord('web', None, EVIL, 'v', 'n'), None, 'AUTH-1046', 'web'),
        (
            LoginRecord('web', None, envs.WEB_SIGNIN_URI + '.evil', 'v', 'n'),
            None,
            'AUTH-1046',
            'web',
        ),
        (
            LoginRecord('cli', 'l', EVIL, 'v', 'n'),
            {'callback_url': LOOPBACK},
            'AUTH-1046',
            'cli',
        ),
        (
            LoginRecord('cli', 'l', LOOPBACK, 'v', 'n'),
            {'callback_url': 'oob', 'flow': 'pkce'},
            'AUTH-1046',
            'cli',
        ),
        (LoginRecord('cli', 'l', LOOPBACK, 'v', 'n'), None, 'AUTH-1019', 'cli'),
        (
            LoginRecord('cli', None, LOOPBACK, 'v', 'n'),
            {'callback_url': LOOPBACK},
            'AUTH-1019',
            'cli',
        ),
    ],
)
async def test_a_record_naming_a_target_it_may_not_end_on_is_refused(
    _issuer, caplog, record, login, code, flow
):
    use_case, oidc, sign_in = _complete(record, login)

    with pytest.raises(BorderlessLoginFailed) as excinfo:
        await use_case.execute(PARAMS, 'binding')

    assert (excinfo.value.code.value, excinfo.value.flow) == (code, flow)
    assert not excinfo.value.unexpected
    # Nothing exchanged, nobody signed in, and the target is never logged.
    oidc.exchange.assert_not_awaited()
    sign_in.execute.assert_not_awaited()
    text = ' '.join(r.getMessage() for r in caplog.records)
    assert EVIL not in text and LOOPBACK not in text


@pytest.mark.parametrize(
    ('record', 'login'),
    [
        (LoginRecord('web', None, envs.WEB_SIGNIN_URI, 'v', 'n'), None),
        (
            LoginRecord('cli', 'l', LOOPBACK, 'v', 'n'),
            {'callback_url': LOOPBACK},
        ),
        (
            LoginRecord('cli', 'l', MANUAL, 'v', 'n'),
            {'callback_url': 'oob', 'flow': 'pkce'},
        ),
    ],
)
async def test_the_checked_target_rides_the_outcome(_issuer, record, login):
    use_case, oidc, _ = _complete(record, login)

    outcome = await use_case.execute(PARAMS, 'binding')

    assert outcome.target == record.target
    assert (outcome.flow, outcome.user_id) == (record.flow, 7)
    oidc.exchange.assert_awaited_once()
