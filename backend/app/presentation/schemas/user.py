from collections.abc import Sequence
from datetime import datetime
from typing import Literal

from pydantic import EmailStr

from app.application.use_cases.borderless.badge_access import access_status
from app.core.enums import (
    Availability,
    Currency,
    ExperienceLevel,
    SalaryPeriod,
)
from app.domain.models import (
    BorderlessAccountModel,
    GithubConnectionModel,
    UserBadgeModel,
)
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema


class BadgeOut(BaseSchema):
    """A recorded (live) badge, held or not: whether it counts is
    ``borderless.status == 'active'``."""

    badge: Literal['borderless_base', 'borderless_psp']
    granted_at: datetime


class BorderlessAccessOut(BaseSchema):
    """The state of the Borderless access from the last password sign-in,
    computed at request time. Never the token."""

    status: Literal['active', 'expired', 'needs_reconnect']
    expires_at: datetime
    email: str


class GithubRestoreOut(BaseSchema):
    """``available``: no GitHub identity on record. ``prompt``: available
    and the one-time welcome screen not answered yet."""

    available: bool
    prompt: bool


class UserProfile(BaseSchema, TimeSchema):
    id: SnowflakeID
    # The GitHub-era identity on record (``github_connections``), else null.
    github_id: int | None = None
    username: str
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    current_company: str | None = None
    current_salary: float | None = None
    tech_stack: list[str] | None = None
    experience_years: int = 0
    current_role: str | None = None
    salary_currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    seniority_level: ExperienceLevel | None = None
    location: str | None = None
    availability: Availability | None = None
    bio: str | None = None
    linkedin_url: str | None = None
    is_admin: bool = False
    badges: list[BadgeOut] = []
    borderless: BorderlessAccessOut | None = None
    github_restore: GithubRestoreOut = GithubRestoreOut(
        available=False, prompt=False
    )

    @classmethod
    def from_user(
        cls,
        user,
        badges: Sequence[UserBadgeModel] = (),
        binding: BorderlessAccountModel | None = None,
        github: GithubConnectionModel | None = None,
    ) -> 'UserProfile':
        profile = cls.model_validate(user, from_attributes=True)
        profile.github_id = github.github_id if github is not None else None
        profile.badges = [
            BadgeOut.model_validate(row)
            for row in badges
            if row.revoked_at is None
        ]
        status = access_status(binding)
        if binding is not None and status is not None:
            profile.borderless = BorderlessAccessOut(
                status=status,
                expires_at=binding.access_token_expires_at,
                email=binding.email,
            )
        available = github is None
        profile.github_restore = GithubRestoreOut(
            available=available,
            prompt=available
            and getattr(user, 'github_restore_prompt_seen_at', None) is None,
        )
        return profile


class UpdateUserProfile(BaseSchema):
    first_name: str | None = None
    last_name: str | None = None
    current_role: str | None = None
    current_company: str | None = None
    current_salary: float | None = None
    salary_currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    experience_years: int | None = None
    seniority_level: ExperienceLevel | None = None
    location: str | None = None
    availability: Availability | None = None
    bio: str | None = None
    linkedin_url: str | None = None
    tech_stack: list[str] | None = None
