"""Beta feature schemas (KODI-052, ADR-0018): the caller's own features
(``GET /users/me/features``) and the admin screen (``/admin/features*``).
Ids are Snowflake strings on the wire (ADR-0003)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema

Stage = Literal['beta', 'general']


class MyFeature(BaseSchema):
    key: str
    stage: Stage


class MyFeatures(BaseSchema):
    """The features the caller has, by key."""

    features: list[MyFeature]


class FeatureMe(BaseSchema):
    """The calling admin's own access: whether they have it now, why
    (``general`` | ``list`` | ``admin``, null when they do not), and
    whether they turned it off for themselves."""

    has: bool
    via: Literal['general', 'list', 'admin'] | None
    opted_out: bool


class FeatureAdminRow(BaseSchema):
    """One feature on the admin screen (R-006). ``beta_user_count`` counts
    beta-list rows only, never admins who have it as admins."""

    key: str
    name: str
    description: str | None
    stage: Stage
    beta_user_count: int
    released_at: datetime | None
    updated_at: datetime
    me: FeatureMe


class FeatureStageUpdate(BaseModel):
    """Release (``general``) or move back to ``beta``; nothing else is
    editable."""

    model_config = ConfigDict(extra='forbid')

    stage: Stage


class UserRef(BaseSchema):
    id: SnowflakeID
    username: str


class FeatureUser(BaseSchema):
    user_id: SnowflakeID
    username: str
    email: str
    added_at: datetime
    added_by: UserRef | None


class FeatureUsersPage(BaseSchema):
    items: list[FeatureUser]
    total: int
    page: int
    per_page: int
    total_pages: int
