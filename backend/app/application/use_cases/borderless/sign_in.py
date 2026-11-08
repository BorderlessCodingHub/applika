"""Open the applika account of a verified Borderless identity (ADR-0024 §1,
ADR-0026 §5, §6, §7).

The identity comes from an id_token the OpenID Connect client verified. An
unverified email is refused (AUTH-1005). Resolution, keyed by ``sub``, in
order: (1) the account bound to that Borderless account; (2) the account
whose email equals the Borderless email ignoring case (the exact spelling
first), bound now, refused when it is bound to another Borderless account
(AUTH-1006) or when several accounts match and none exactly (AUTH-1007);
(3) a new account. A binding never moves here. Before (2) and (3), a
Borderless email applika cannot store (over 100 characters once
normalized, or refused by ``UserCreateDTO``) is refused (AUTH-1008),
before any write.

The binding takes the new refresh token, encrypted (one grant per user:
it replaces the previous one, which is not revoked), ``active`` and a
fresh ``profile_read_at``; the membership claim becomes the badge; all of
it in one commit. Then the access token goes to Redis.
"""

from dataclasses import dataclass

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserCreateDTO
from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.application.services.borderless_oidc import (
    BorderlessGrant,
    BorderlessIdentity,
)
from app.application.use_cases.borderless.membership import badge_for
from app.config.logging import logger
from app.core.crypto import encrypt_borderless_token
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    BORDERLESS_NOT_CONFIGURED,
    BindingConflict,
    EmailAmbiguous,
    EmailUnusable,
    EmailUnverified,
    ServiceUnavailable,
)
from app.domain.models import UserModel
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from app.domain.repositories.user_badge_repository import UserBadgeRepository
from app.domain.repositories.user_repository import UserRepository

BOUND_TO_ANOTHER = (
    'This email belongs to an applika account linked to another '
    'Borderless account. Sign in with that Borderless account, or contact '
    'support'
)
AMBIGUOUS = 'More than one applika account uses this email; contact support'
USERNAME_MAX = 100
EMAIL_MAX = 100  # users.email is VARCHAR(100)


@dataclass(frozen=True)
class SignInResult:
    user_id: int
    new_account: bool


def username_for(identity: BorderlessIdentity) -> str:
    """Borderless's display name, else its username, else the email's
    local part."""
    for value in (identity.name, identity.preferred_username):
        if value and value.strip():
            return value.strip()[:USERNAME_MAX]
    return identity.email.split('@', 1)[0][:USERNAME_MAX] or 'user'


def new_user_dto(identity: BorderlessIdentity) -> UserCreateDTO:
    """The account a Borderless identity creates, or ``EmailUnusable`` when
    its email cannot be stored as an applika account email."""
    if len(identity.email) > EMAIL_MAX:
        raise EmailUnusable()
    try:
        dto = UserCreateDTO(
            username=username_for(identity), email=identity.email
        )
    except ValidationError:
        raise EmailUnusable() from None
    # EmailStr normalizes (UTS46 domain, NFC local part): it can grow.
    if len(dto.email) > EMAIL_MAX:
        raise EmailUnusable()
    return dto


class BorderlessSignInUseCase:
    def __init__(self, session: AsyncSession, access: BorderlessAccessStore):
        self.session = session
        self.access = access
        self.users = UserRepository(session)
        self.bindings = BorderlessAccountRepository(session)
        self.badges = UserBadgeRepository(session)

    async def execute(
        self, identity: BorderlessIdentity, grant: BorderlessGrant
    ) -> SignInResult:
        if not identity.email_verified:
            raise EmailUnverified()
        ciphertext = encrypt_borderless_token(grant.refresh_token or '')
        if not grant.refresh_token or ciphertext is None:
            raise ServiceUnavailable(
                BORDERLESS_NOT_CONFIGURED,
                ErrorCode.AUTH_BORDERLESS_NOT_CONFIGURED,
            )
        try:
            user_id, new_account = await self._resolve(identity, ciphertext)
            await self.badges.apply(
                user_id, badge_for(identity.membership), commit=False
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.access.put(user_id, grant.access_token, grant.expires_in)
        logger.info(
            f'Borderless sign-in for user {user_id} (new={new_account})'
        )
        return SignInResult(user_id=user_id, new_account=new_account)

    async def _resolve(
        self, identity: BorderlessIdentity, ciphertext: str
    ) -> tuple[int, bool]:
        binding = await self.bindings.get_by_borderless_id(identity.sub)
        if binding is not None:
            await self.bindings.store_refresh_token(
                binding,
                email=identity.email,
                encrypted_refresh_token=ciphertext,
                commit=False,
            )
            return binding.user_id, False

        dto = new_user_dto(identity)
        user = await self._match_by_email(identity.email)
        new_account = user is None
        if user is None:
            user = await self.users.create(dto, commit=False)
        user_id = user.id
        await self.bindings.bind(
            user_id=user_id,
            borderless_user_id=identity.sub,
            email=identity.email,
            encrypted_refresh_token=ciphertext,
            commit=False,
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
