"""``POST /auth/token`` (R-015, R-016): one token endpoint, three grants."""

from app.application.dto.user_session import SessionTokensDTO
from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.application.use_cases.cli_auth.authorize import PKCE_FLOW
from app.application.use_cases.cli_auth.device_code import DeviceCodeUseCase
from app.application.use_cases.sessions.open_session import (
    OpenSessionUseCase,
)
from app.application.use_cases.sessions.refresh_session import (
    RefreshSessionUseCase,
)
from app.core.exceptions import InvalidSession, OAuthError
from app.core.pkce import verify_s256

AUTHORIZATION_CODE = 'authorization_code'
REFRESH_TOKEN = 'refresh_token'
DEVICE_CODE = 'urn:ietf:params:oauth:grant-type:device_code'
GRANT_TYPES = (AUTHORIZATION_CODE, REFRESH_TOKEN, DEVICE_CODE)

INVALID_CODE = 'Invalid or expired code'
REDIRECT_MISMATCH = 'redirect_uri does not match'
VERIFIER_MISMATCH = 'Invalid code_verifier'


class CliTokenUseCase:
    def __init__(
        self,
        handoff_state: AuthHandoffStateUseCase,
        open_session: OpenSessionUseCase,
        refresh_session: RefreshSessionUseCase,
        device_codes: DeviceCodeUseCase,
    ):
        self.handoff_state = handoff_state
        self.open_session = open_session
        self.refresh_session = refresh_session
        self.device_codes = device_codes

    async def authorization_code(
        self,
        code: str,
        code_verifier: str,
        redirect_uri: str,
        device_name: str | None,
        user_agent: str | None,
        ip: str | None,
    ) -> SessionTokensDTO:
        """Redeem a PKCE login code: one use (``GETDEL``) even when the
        verifier is wrong, bound to its challenge and ``redirect_uri``."""
        state = await self.handoff_state.pop_exchange_code(code)
        if state is None or state.get('flow') != PKCE_FLOW:
            raise OAuthError('invalid_grant', INVALID_CODE)
        if state.get('redirect_uri') != redirect_uri:
            raise OAuthError('invalid_grant', REDIRECT_MISMATCH)
        if not verify_s256(code_verifier, str(state.get('code_challenge'))):
            raise OAuthError('invalid_grant', VERIFIER_MISMATCH)
        return await self.open_session.execute(
            user_id=int(state['user_id']),
            client_type='cli',
            sign_in_method='cli_browser',
            user_agent=user_agent,
            ip=ip,
            device_name=device_name,
        )

    async def refresh_token(self, refresh_token: str) -> SessionTokensDTO:
        """Same value back, ``expires_at`` slid a full window (never
        rotated)."""
        try:
            return await self.refresh_session.execute(refresh_token)
        except InvalidSession as err:
            raise OAuthError('invalid_grant', err.message) from err

    async def device_code(self, device_code: str) -> SessionTokensDTO:
        """An approved code becomes one ``cli_device`` session signed in as
        the user who approved it."""
        device = await self.device_codes.poll(device_code)
        return await self.open_session.execute(
            user_id=device.user_id,
            client_type='cli',
            sign_in_method='cli_device',
            user_agent=device.user_agent,
            ip=device.ip,
            device_name=device.device_name,
        )
