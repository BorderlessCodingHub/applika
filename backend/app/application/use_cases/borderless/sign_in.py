"""Sign in with a Borderless email and password (ADR-0024).

Resolution, in order: (1) the account bound to the Borderless id; (2) the
account whose email equals the Borderless email ignoring case (the exact
spelling first), bound now, refused when it is bound to another Borderless
account or when several accounts match and none exactly; (3) a new
account. A binding never moves here. Before (2) and (3), a Borderless email
applika cannot store (over 100 characters once normalized, or refused by
``UserCreateDTO``) is refused, before any write.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import redis.asyncio as redis
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserCreateDTO
from app.application.services.borderless_client import (
    BorderlessClient,
    BorderlessSignIn,
)
from app.application.use_cases.borderless.credentials import (
    SignInLimiter,
    check_credentials,
)
from app.application.use_cases.borderless.refresh_badges import (
    RefreshBadgesUseCase,
)
from app.config.logging import logger
from app.core.crypto import encrypt_borderless_token
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    BORDERLESS_NOT_CONFIGURED,
    BindingConflict,
    EmailAmbiguous,
    EmailUnusable,
    ServiceUnavailable,
)
from app.domain.models import UserModel
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_repository import UserRepository

BOUND_TO_ANOTHER = (
    'This email belongs to an applika account linked to another '
    'Borderless account'
)
AMBIGUOUS = 'More than one applika account uses this email; contact support'
USERNAME_MAX = 100
EMAIL_MAX = 100  # users.email is VARCHAR(100)


@dataclass(frozen=True)
class SignInResult:
    user_id: int
    new_account: bool


def username_for(answer: BorderlessSignIn) -> str:
    for value in (answer.name, answer.username):
        if value and value.strip():
            return value.strip()[:USERNAME_MAX]
    return answer.email.split('@', 1)[0][:USERNAME_MAX] or 'user'


def new_user_dto(answer: BorderlessSignIn) -> UserCreateDTO:
    """The account a Borderless answer creates, or ``EmailUnusable`` when
    its email cannot be stored as an applika account email."""
    if len(answer.email) > EMAIL_MAX:
        raise EmailUnusable()
    try:
        dto = UserCreateDTO(username=username_for(answer), email=answer.email)
    except ValidationError:
        raise EmailUnusable() from None
    # EmailStr normalizes (UTS46 domain, NFC local part): it can grow.
    if len(dto.email) > EMAIL_MAX:
        raise EmailUnusable()
    return dto


def encrypted_token(answer: BorderlessSignIn) -> tuple[str, datetime]:
    ciphertext = encrypt_borderless_token(answer.access_token)
    if ciphertext is None:
        raise ServiceUnavailable(
            BORDERLESS_NOT_CONFIGURED, ErrorCode.AUTH_BORDERLESS_NOT_CONFIGURED
        )
    expires_at = datetime.now(UTC) + timedelta(seconds=answer.expires_in)
    return ciphertext, expires_at


class BorderlessSignInUseCase:
    def __init__(
        self,
        session: AsyncSession,
        redis_client: redis.Redis,
        client: BorderlessClient,
    ):
        self.session = session
        self.client = client
        self.limiter = SignInLimiter(redis_client)
        self.users = UserRepository(session)
        self.bindings = BorderlessAccountRepository(session)

    async def execute(self, email: str, password: str) -> SignInResult:
        answer = await check_credentials(
            self.limiter, self.client, email, password
        )
        ciphertext, expires_at = encrypted_token(answer)
        user_id, new_account = await self._resolve(
            answer, ciphertext, expires_at
        )
        await RefreshBadgesUseCase(self.session, self.client).execute(user_id)
        logger.info(
            f'Borderless sign-in for user {user_id} (new={new_account})'
        )
        return SignInResult(user_id=user_id, new_account=new_account)

    async def _resolve(
        self, answer: BorderlessSignIn, ciphertext: str, expires_at: datetime
    ) -> tuple[int, bool]:
        binding = await self.bindings.get_by_borderless_id(answer.user_id)
        if binding is not None:
            await self.bindings.store_tokens(
                binding,
                email=answer.email,
                encrypted_access_token=ciphertext,
                access_token_expires_at=expires_at,
            )
            return binding.user_id, False

        dto = new_user_dto(answer)
        user = await self._match_by_email(answer.email)
        new_account = user is None
        if user is None:
            user = await self.users.create(dto, commit=False)
        user_id = user.id
        await self.bindings.bind(
            user_id=user_id,
            borderless_user_id=answer.user_id,
            email=answer.email,
            encrypted_access_token=ciphertext,
            access_token_expires_at=expires_at,
        )
        return user_id, new_account

    async def _match_by_email(self, email: str) -> UserModel | None:
        matches = await self.users.find_by_email_ci(email)
        if not matches:
            return None
        exact = [user for user in matches if user.email == email]
        if exact:
            user = exact[0]
        elif len(matches) == 1:
            user = matches[0]
        else:
            raise EmailAmbiguous(AMBIGUOUS)
        if await self.bindings.get_by_user_id(user.id) is not None:
            raise BindingConflict(BOUND_TO_ANOTHER)
        return user
