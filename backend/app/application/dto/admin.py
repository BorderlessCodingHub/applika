from datetime import datetime

from pydantic import BaseModel, ConfigDict


class _AdminDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Stats ---


class PlatformStatsDTO(_AdminDTO):
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


class TopPlatformStatDTO(_AdminDTO):
    name: str
    total_across_users: int
    unique_users: int


class TopCompanyStatDTO(_AdminDTO):
    name: str
    total_across_users: int
    unique_users: int


class ActivityHeatmapPointDTO(_AdminDTO):
    hour: int
    day: int
    count: int


# --- Users ---


class AdminUserRowDTO(_AdminDTO):
    id: int
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


class PaginatedUsersDTO(_AdminDTO):
    items: list[AdminUserRowDTO]
    total: int
    page: int
    per_page: int
    total_pages: int


class UserGrowthPointDTO(_AdminDTO):
    date: str
    label: str
    total_users: int
    new_users: int


class SeniorityBreakdownDTO(_AdminDTO):
    level: str
    count: int
    color: str


class AdminUserDetailDTO(_AdminDTO):
    id: int
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


class AdminUserUpdateDTO(BaseModel):
    is_admin: bool | None = None
    seniority_level: str | None = None
    location: str | None = None


# --- Companies ---


class AdminCompanyRowDTO(_AdminDTO):
    id: int
    name: str
    url: str
    is_active: bool
    applications_count: int = 0
    created_by_username: str | None = None
    created_at: datetime


class PaginatedCompaniesDTO(_AdminDTO):
    items: list[AdminCompanyRowDTO]
    total: int
    page: int
    per_page: int
    total_pages: int


class AdminCompanyCreateDTO(BaseModel):
    name: str
    url: str


class AdminCompanyUpdateDTO(BaseModel):
    name: str | None = None
    url: str | None = None
    is_active: bool | None = None
