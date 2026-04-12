from datetime import datetime

from pydantic import BaseModel

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class AdminPlatformStatsSchema(BaseSchema):
    total_users: int
    active_users_30d: int
    total_applications: int
    total_offers: int
    total_denials: int
    avg_applications_per_user: float
    global_success_rate: float
    new_users_7d: int
    total_finalized: int = 0
    finalization_rate: float = 0
    applications_last_30d: int = 0


class AdminUserRowSchema(BaseSchema):
    id: SnowflakeID
    username: str
    email: str
    github_id: int
    seniority_level: str | None = None
    location: str | None = None
    is_admin: bool = False
    total_applications: int = 0
    offers: int = 0
    denials: int = 0
    active_applications: int = 0
    last_activity: datetime
    joined_at: datetime


class PaginatedUsersSchema(BaseSchema):
    items: list[AdminUserRowSchema]
    total: int
    page: int
    per_page: int
    total_pages: int


class UserGrowthPointSchema(BaseSchema):
    date: str
    label: str
    total_users: int
    new_users: int


class SeniorityBreakdownSchema(BaseSchema):
    level: str
    count: int
    color: str


class TopPlatformStatSchema(BaseSchema):
    name: str
    total_across_users: int
    unique_users: int


class TopCompanyStatSchema(BaseSchema):
    name: str
    total_across_users: int
    unique_users: int


class ActivityHeatmapPointSchema(BaseSchema):
    hour: int
    day: int
    count: int


class AdminUserDetailSchema(BaseSchema):
    id: SnowflakeID
    username: str
    email: str
    github_id: int
    first_name: str | None = None
    last_name: str | None = None
    current_role: str | None = None
    current_company: str | None = None
    seniority_level: str | None = None
    location: str | None = None
    bio: str | None = None
    linkedin_url: str | None = None
    tech_stack: list[str] | None = None
    availability: str | None = None
    is_admin: bool = False
    is_org_member: bool = False
    total_applications: int = 0
    offers: int = 0
    denials: int = 0
    active_applications: int = 0
    last_activity: datetime
    joined_at: datetime


class AdminUpdateUserSchema(BaseModel):
    is_admin: bool | None = None
    seniority_level: str | None = None
    location: str | None = None


class AdminCompanyRowSchema(BaseSchema):
    id: SnowflakeID
    name: str
    url: str
    is_active: bool
    applications_count: int = 0
    created_by_username: str | None = None
    created_at: datetime


class PaginatedCompaniesSchema(BaseSchema):
    items: list[AdminCompanyRowSchema]
    total: int
    page: int
    per_page: int
    total_pages: int


class CreateCompanySchema(BaseModel):
    name: str
    url: str


class UpdateCompanySchema(BaseModel):
    name: str | None = None
    url: str | None = None
    is_active: bool | None = None


class CreatePlatformSchema(BaseModel):
    name: str
    url: str | None = None


class UpdatePlatformSchema(BaseModel):
    name: str | None = None
    url: str | None = None


class PlatformSchema(BaseSchema):
    id: SnowflakeID
    name: str
    url: str | None = None


class CreateStepDefinitionSchema(BaseModel):
    name: str
    color: str = '#007bff'
    strict: bool = False


class UpdateStepDefinitionSchema(BaseModel):
    name: str | None = None
    color: str | None = None
    strict: bool | None = None


class StepDefinitionSchema(BaseSchema):
    id: SnowflakeID
    name: str
    color: str
    strict: bool


class CreateFeedbackDefinitionSchema(BaseModel):
    name: str
    color: str = '#28a745'


class UpdateFeedbackDefinitionSchema(BaseModel):
    name: str | None = None
    color: str | None = None


class FeedbackDefinitionSchema(BaseSchema):
    id: SnowflakeID
    name: str
    color: str
