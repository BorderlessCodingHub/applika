from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import InvalidRequest
from app.core.pkce import S256, is_valid_challenge

PKCE_FLOW = 'pkce'
# ``redirect_uri=oob``: the browser cannot reach a loopback callback, so the
# code is shown on ``CLI_MANUAL_REDIRECT_URI`` for the user to paste (R-018).
OOB_REDIRECT_URI = 'oob'
METHOD_NOT_S256 = 'code_challenge_method must be S256'
INVALID_CHALLENGE = 'Invalid code_challenge'


class CliAuthorizeUseCase:
    """Start the CLI's browser sign-in, bound to a PKCE S256 challenge
    (R-015). The router has already checked ``redirect_uri`` (loopback or
    ``oob``). Answers the pending login id the GitHub callback resolves."""

    def __init__(self, handoff_state: AuthHandoffStateUseCase):
        self.handoff_state = handoff_state

    async def execute(
        self,
        redirect_uri: str,
        code_challenge: str,
        code_challenge_method: str,
        state: str,
    ) -> str:
        if code_challenge_method != S256:
            raise InvalidRequest(
                METHOD_NOT_S256, ErrorCode.AUTH_PKCE_METHOD_NOT_S256
            )
        if not is_valid_challenge(code_challenge):
            raise InvalidRequest(
                INVALID_CHALLENGE, ErrorCode.AUTH_PKCE_INVALID_CHALLENGE
            )
        return await self.handoff_state.create_login(
            callback_url=redirect_uri,
            state=state,
            flow=PKCE_FLOW,
            code_challenge=code_challenge,
        )
