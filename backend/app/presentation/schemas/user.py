from pydantic import EmailStr

from app.core.enums import (
    Availability,
    Currency,
    DiscordConnectionStatus,
    ExperienceLevel,
    SalaryPeriod,
)
from app.domain.models import DiscordConnectionModel
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema


class DiscordAccountOut(BaseSchema):
    """The Discord connection as shown on ``/users/me`` (KODI-024, R-018).

    Never the Discord id: only ``username``, ``global_name``, a computed
    ``avatar_url`` and the connection ``status``.
    """

    username: str
    global_name: str | None = None
    avatar_url: str | None = None
    status: DiscordConnectionStatus


def _discord_avatar_url(discord_id: int, avatar: str | None) -> str | None:
    if not avatar:
        return None
    return (
        f'https://cdn.discordapp.com/avatars/{discord_id}/{avatar}.png?size=64'
    )


def _discord_account(
    connection: DiscordConnectionModel | None,
) -> DiscordAccountOut | None:
    if connection is None:
        return None
    return DiscordAccountOut(
        username=connection.username,
        global_name=connection.global_name,
        avatar_url=_discord_avatar_url(
            connection.discord_id, connection.avatar
        ),
        status=connection.status,
    )


class UserProfile(BaseSchema, TimeSchema):
    id: SnowflakeID
    github_id: int
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
    # Whether Discord is linked (KODI-024, R-018). Never the id itself -
    # that stays internal to ``DiscordConnectionModel`` and is never a field
    # here. ``from_user`` is the one place that reads the connection, so the
    # presentation layer never has to name ``discord_id``.
    discord_linked: bool = False
    discord: DiscordAccountOut | None = None

    @classmethod
    def from_user(
        cls, user, connection: DiscordConnectionModel | None = None
    ) -> 'UserProfile':
        profile = cls.model_validate(user)
        profile.discord = _discord_account(connection)
        profile.discord_linked = profile.discord is not None
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
