"""DTOs of the beta features (KODI-052, ADR-0018): what the feature use
cases return to the routers."""

from datetime import datetime

from pydantic import BaseModel

from app.core.features import AccessVia, FeatureStage


class MyFeatureDTO(BaseModel):
    """One feature the caller has, with its stage."""

    key: str
    stage: FeatureStage


class FeatureAccessDTO(BaseModel):
    """Whether the caller has a feature right now, why, and whether they
    turned it off for themselves (R-014, R-015, R-017)."""

    has: bool
    via: AccessVia | None
    opted_out: bool


class FeatureAdminDTO(BaseModel):
    """One feature on the admin screen (R-006). ``beta_user_count`` counts
    beta-list rows only; ``me`` is the calling admin's own access."""

    id: int
    key: str
    name: str
    description: str | None
    stage: FeatureStage
    beta_user_count: int
    released_at: datetime | None
    updated_at: datetime
    me: FeatureAccessDTO


class UserRefDTO(BaseModel):
    id: int
    username: str


class FeatureUserDTO(BaseModel):
    """One user on a beta list (R-007). ``added_by`` is null once the
    admin who added them is gone."""

    user_id: int
    username: str
    email: str
    added_at: datetime
    added_by: UserRefDTO | None


class FeatureUsersPageDTO(BaseModel):
    items: list[FeatureUserDTO]
    total: int
    page: int
    per_page: int
    total_pages: int
