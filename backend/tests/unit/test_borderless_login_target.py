"""Where a Borderless sign-in may end (ADR-0026 §3): the web sign-in page,
``WEB_SIGNIN_URI``, and nowhere else (the CLI hand-offs are gone since
ADR-0028). ``begin`` stores that target in the attempt; ``complete``
refuses a record naming anything else before any exchange."""

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
from app.config.settings import envs

LOOPBACK = 'http://127.0.0.1:43129/callback'
EVIL = 'https://evil.example.test/steal'
MANUAL = 'https://web.example.test/cli/code'


# --------------------------------------------------------------------------
# begin stores the target
# --------------------------------------------------------------------------


def _oidc() -> MagicMock:
    oidc = MagicMock()
    oidc.is_configured.return_value = True
    oidc.discovery = AsyncMock(return_value={'issuer': 'x'})
    oidc.authorize_url.return_value = 'https://borderless.test/authorize'
    return oidc


async def test_begin_stores_the_web_sign_in_page_as_the_target():
    login_state = AsyncMock()
    login_state.create.return_value = SimpleNamespace(
        state='s', nonce='n', verifier='v' * 43, binding='b'
    )
    oidc = _oidc()
    begin = BeginBorderlessLoginUseCase(oidc, login_state)

    assert await begin.execute() == ('https://borderless.test/authorize', 'b')
    login_state.create.assert_awaited_once_with(target=envs.WEB_SIGNIN_URI)
    # No ``prompt``: the Borderless browser session is reused.
    assert 'prompt_login' not in oidc.authorize_url.call_args.kwargs


# --------------------------------------------------------------------------
# complete checks it again, before anything else happens
# --------------------------------------------------------------------------


def _complete(record: LoginRecord):
    oidc = MagicMock()
    oidc.exchange = AsyncMock()
    login_state = AsyncMock()
    login_state.consume.return_value = record
    sign_in = AsyncMock()
    sign_in.execute.return_value = SimpleNamespace(user_id=7, new_account=False)
    use_case = CompleteBorderlessLoginUseCase(oidc, login_state, sign_in)
    return use_case, oidc, sign_in


PARAMS = {'code': 'c', 'state': 's', 'iss': 'https://issuer.test'}


@pytest.fixture
def _issuer(monkeypatch):
    monkeypatch.setattr(envs, 'BORDERLESS_ISSUER', PARAMS['iss'])


@pytest.mark.parametrize(
    'target',
    [
        EVIL,
        envs.WEB_SIGNIN_URI + '.evil',
        # A CLI attempt stored before ADR-0028: its hand-off is no target.
        LOOPBACK,
        MANUAL,
    ],
)
@pytest.mark.usefixtures('_issuer')
async def test_a_record_naming_a_target_it_may_not_end_on_is_refused(
    caplog, target
):
    use_case, oidc, sign_in = _complete(LoginRecord(target, 'v', 'n'))

    with pytest.raises(BorderlessLoginFailed) as excinfo:
        await use_case.execute(PARAMS, 'binding')

    assert excinfo.value.code.value == 'AUTH-1046'
    assert not excinfo.value.unexpected
    # Nothing exchanged, nobody signed in, and the target is never logged.
    oidc.exchange.assert_not_awaited()
    sign_in.execute.assert_not_awaited()
    text = ' '.join(r.getMessage() for r in caplog.records)
    assert target not in text


@pytest.mark.usefixtures('_issuer')
async def test_the_checked_target_rides_the_outcome():
    use_case, oidc, _ = _complete(LoginRecord(envs.WEB_SIGNIN_URI, 'v', 'n'))

    outcome = await use_case.execute(PARAMS, 'binding')

    assert outcome.target == envs.WEB_SIGNIN_URI
    assert outcome.user_id == 7
    oidc.exchange.assert_awaited_once()
