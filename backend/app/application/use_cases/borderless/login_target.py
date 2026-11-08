"""Where a Borderless sign-in sends the browser at the end (ADR-0026 §3).

Two targets exist, and nothing else is ever followed:

- a web sign-in lands on the web sign-in page, ``WEB_SIGNIN_URI``;
- a CLI sign-in hands its code back where its CLI login was started at
  ``/auth/cli/*``: the loopback ``redirect_uri`` (still loopback), or, for
  a PKCE ``oob`` login, ``CLI_MANUAL_REDIRECT_URI``
  (``cli_handoff_target``).

``BeginBorderlessLoginUseCase`` stores the target in the attempt's Redis
record; ``CompleteBorderlessLoginUseCase`` derives it again here and
refuses a record whose target differs. No query string decides a target.
"""

from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.application.use_cases.borderless.login_state import Flow
from app.application.use_cases.cli_auth.callback_url import (
    cli_handoff_target,
)
from app.config.settings import envs

# The words of AUTH-1019 (the web shows them for ``?error=AUTH-1019``).
CLI_LOGIN_EXPIRED = 'CLI login expired'


class BorderlessLoginTargets:
    def __init__(self, handoff_state: AuthHandoffStateUseCase):
        self.handoff_state = handoff_state

    async def allowed(self, flow: Flow, cli_login_id: str | None) -> str | None:
        """The one target this attempt may end on; ``None`` for a CLI
        sign-in whose CLI login is gone or allows no hand-off."""
        if flow == 'web':
            return envs.WEB_SIGNIN_URI
        if not cli_login_id:
            return None
        login = await self.handoff_state.get_login(cli_login_id)
        if login is None:
            return None
        return cli_handoff_target(login)
