"""Start a Borderless sign-in (ADR-0026 §2, §3, §11).

Not configured → AUTH-1018; the discovery document unreachable → AUTH-1017;
a CLI sign-in whose CLI login allows no hand-off → AUTH-1019. Otherwise a
new attempt, whose record keeps the one target the sign-in may end on
(``BorderlessLoginTargets``: ``WEB_SIGNIN_URI``, or the CLI login's own
hand-off), and the authorize URL: the four scopes, the ``state``, the
``nonce`` and the S256 challenge, plus ``prompt=login`` for a CLI sign-in
only, so a web sign-in reuses the Borderless browser session.
"""

from app.application.services.borderless_oidc import (
    BorderlessNotConfigured,
    BorderlessOidcClient,
    BorderlessUnavailable,
)
from app.application.use_cases.borderless.login_state import (
    BorderlessLoginStateUseCase,
    Flow,
)
from app.application.use_cases.borderless.login_target import (
    CLI_LOGIN_EXPIRED,
    BorderlessLoginTargets,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    BORDERLESS_NOT_CONFIGURED,
    BORDERLESS_UNAVAILABLE,
    CodedRefusal,
    ServiceUnavailable,
)
from app.core.pkce import s256_challenge


class BeginBorderlessLoginUseCase:
    def __init__(
        self,
        oidc: BorderlessOidcClient,
        login_state: BorderlessLoginStateUseCase,
        targets: BorderlessLoginTargets,
    ):
        self.oidc = oidc
        self.login_state = login_state
        self.targets = targets

    async def execute(
        self, flow: Flow, cli_login_id: str | None = None
    ) -> tuple[str, str]:
        """``(authorize_url, binding)``: the browser goes to the first and
        keeps the second in the ``__applika_login`` cookie."""
        not_configured = ServiceUnavailable(
            BORDERLESS_NOT_CONFIGURED, ErrorCode.AUTH_BORDERLESS_NOT_CONFIGURED
        )
        if not self.oidc.is_configured():
            raise not_configured
        try:
            discovery = await self.oidc.discovery()
        except BorderlessNotConfigured as exc:
            raise not_configured from exc
        except BorderlessUnavailable as exc:
            raise ServiceUnavailable(
                BORDERLESS_UNAVAILABLE, ErrorCode.AUTH_BORDERLESS_UNAVAILABLE
            ) from exc
        target = await self.targets.allowed(flow, cli_login_id)
        if target is None:
            raise CodedRefusal(
                CLI_LOGIN_EXPIRED, ErrorCode.AUTH_CLI_LOGIN_EXPIRED
            )
        attempt = await self.login_state.create(
            flow, cli_login_id, target=target
        )
        url = self.oidc.authorize_url(
            discovery,
            state=attempt.state,
            nonce=attempt.nonce,
            challenge=s256_challenge(attempt.verifier),
            prompt_login=flow == 'cli',
        )
        return url, attempt.binding
