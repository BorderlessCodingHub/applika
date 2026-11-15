"""Complete a Borderless sign-in at the callback (ADR-0026 §3, §4, §5).

Order: the attempt (cookie hash and ``state``, single use) → the attempt's
stored target, equal to ``WEB_SIGNIN_URI`` → ``iss`` equal
to the issuer (RFC 9207) → Borderless's own ``error`` → the code exchange
(HTTP Basic, verifier, ``redirect_uri``; the id_token verified with the
attempt's ``nonce``) → the account (``BorderlessSignInUseCase``). The
outcome carries the checked target, the only place the callback sends the
browser. Nothing from the query is followed or logged.

Every refusal is a ``BorderlessLoginFailed`` carrying its code, so the
callback can send the browser to the sign-in page with ``?error=<code>``:

- AUTH-1046: no attempt for this state and this browser (missing, used,
  expired, another browser, or overwritten by a newer attempt), or an
  attempt whose stored target is not the one it may end on;
- AUTH-1047: Borderless answered ``error`` (the user cancelled, or
  Borderless refused);
- AUTH-1048: no or another ``iss``, no code, the exchange refused (4xx),
  an id_token that does not verify, or no refresh token;
- AUTH-1017 / AUTH-1018: Borderless unavailable / not configured;
- the sign-in's own refusals (AUTH-1005 to AUTH-1008);
- GEN-1005: anything unexpected (``unexpected`` set, the callback logs it).
"""

from collections.abc import Mapping
from dataclasses import dataclass

from app.application.services.borderless_oidc import (
    BorderlessNotConfigured,
    BorderlessOidcClient,
    BorderlessRejected,
    BorderlessUnavailable,
)
from app.application.use_cases.borderless.login_state import (
    BorderlessLoginStateUseCase,
    LoginRecord,
)
from app.application.use_cases.borderless.sign_in import (
    BorderlessSignInUseCase,
)
from app.config.logging import logger
from app.config.settings import envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import CodedRefusal, ServiceUnavailable

# The words the web shows for the three callback-only codes (its ``en``
# messages repeat them); never sent as a JSON body.
LOGIN_EXPIRED = (
    'The sign-in expired or was started in another browser. Start it again'
)
LOGIN_DENIED = 'Borderless did not complete the sign-in. Try signing in again'
LOGIN_UNVERIFIABLE = (
    "Borderless's answer could not be verified. Try signing in again"
)


class BorderlessLoginFailed(Exception):
    """A callback refusal: ``code`` goes to ``?error=``. Never carries a
    query value or a token."""

    def __init__(self, code: ErrorCode, *, unexpected: bool = False):
        super().__init__(code.value)
        self.code = code
        self.unexpected = unexpected


@dataclass(frozen=True)
class LoginOutcome:
    """``target``: the attempt's stored target, checked against the allowed
    one (``WEB_SIGNIN_URI``)."""

    user_id: int
    new_account: bool
    target: str


class CompleteBorderlessLoginUseCase:
    def __init__(
        self,
        oidc: BorderlessOidcClient,
        login_state: BorderlessLoginStateUseCase,
        sign_in: BorderlessSignInUseCase,
    ):
        self.oidc = oidc
        self.login_state = login_state
        self.sign_in = sign_in

    async def execute(
        self, params: Mapping[str, str], binding: str | None
    ) -> LoginOutcome:
        try:
            record = await self.login_state.consume(
                params.get('state'), binding
            )
        except ServiceUnavailable as exc:
            raise BorderlessLoginFailed(exc.code) from exc
        except Exception as exc:
            raise BorderlessLoginFailed(
                ErrorCode.GEN_INTERNAL_ERROR, unexpected=True
            ) from exc
        if record is None:
            logger.info(f'Borderless sign-in refused ({LOGIN_EXPIRED})')
            raise BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED)
        try:
            return await self._complete(params, record)
        except BorderlessLoginFailed:
            raise
        except (CodedRefusal, ServiceUnavailable) as exc:
            raise BorderlessLoginFailed(exc.code) from exc
        except Exception as exc:
            raise BorderlessLoginFailed(
                ErrorCode.GEN_INTERNAL_ERROR, unexpected=True
            ) from exc

    async def _complete(
        self, params: Mapping[str, str], record: LoginRecord
    ) -> LoginOutcome:
        self._check_target(record)
        if params.get('iss') != envs.BORDERLESS_ISSUER:
            logger.warning('Borderless callback without the issuer')
            raise BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_UNVERIFIABLE)
        if params.get('error'):
            logger.info(f'Borderless sign-in refused ({LOGIN_DENIED})')
            raise BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_DENIED)
        code = params.get('code')
        if not code:
            raise BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_UNVERIFIABLE)
        try:
            grant = await self.oidc.exchange(
                code, record.verifier, record.nonce
            )
        except BorderlessRejected as exc:
            logger.warning(f'Borderless sign-in refused ({LOGIN_UNVERIFIABLE})')
            raise BorderlessLoginFailed(
                ErrorCode.AUTH_BORDERLESS_UNVERIFIABLE
            ) from exc
        except BorderlessNotConfigured as exc:
            raise BorderlessLoginFailed(
                ErrorCode.AUTH_BORDERLESS_NOT_CONFIGURED
            ) from exc
        except BorderlessUnavailable as exc:
            raise BorderlessLoginFailed(
                ErrorCode.AUTH_BORDERLESS_UNAVAILABLE
            ) from exc
        result = await self.sign_in.execute(grant.identity, grant)
        return LoginOutcome(
            user_id=result.user_id,
            new_account=result.new_account,
            target=record.target,
        )

    @staticmethod
    def _check_target(record: LoginRecord) -> None:
        """The stored target must be ``WEB_SIGNIN_URI``, or nothing is
        exchanged and nobody is signed in. Logs neither URL."""
        if record.target != envs.WEB_SIGNIN_URI:
            logger.warning(
                'Borderless sign-in refused (the attempt names a target it '
                'may not end on)'
            )
            raise BorderlessLoginFailed(ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED)
