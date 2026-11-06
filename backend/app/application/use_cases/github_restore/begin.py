"""Start a GitHub restore (ADR-0024): the consent URL for the caller.

Offered only to an account with no GitHub identity on record. Starting it
marks the one-time welcome prompt as seen.
"""

from app.application.services.github_service import GitHubOAuthService
from app.application.use_cases.account_link_state import (
    AccountLinkStateUseCase,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict, ServiceUnavailable
from app.domain.repositories.github_connection_repository import (
    GithubConnectionRepository,
)
from app.domain.repositories.user_repository import UserRepository

ALREADY_RESTORED = 'This account already has its GitHub data'
NOT_CONFIGURED = 'GitHub restore is not configured'


class BeginGithubRestoreUseCase:
    def __init__(
        self,
        users: UserRepository,
        connections: GithubConnectionRepository,
        state: AccountLinkStateUseCase,
        github: GitHubOAuthService,
    ):
        self.users = users
        self.connections = connections
        self.state = state
        self.github = github

    async def execute(self, user_id: int) -> str:
        if not self.github.is_configured():
            raise ServiceUnavailable(
                NOT_CONFIGURED, ErrorCode.AUTH_GITHUB_RESTORE_NOT_CONFIGURED
            )
        if await self.connections.get_by_user_id(user_id) is not None:
            raise ResourceConflict(
                ALREADY_RESTORED, ErrorCode.AUTH_GITHUB_ALREADY_RESTORED
            )
        await self.users.mark_restore_prompt_seen(user_id)
        nonce = await self.state.create(user_id)
        return self.github.authorize_url(nonce)
