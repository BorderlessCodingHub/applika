from pydantic import BaseModel, EmailStr

from app.application.dto import BaseSchema
from app.core.enums import (
    Availability,
    Currency,
    ExperienceLevel,
    SalaryPeriod,
)


class UserCreateDTO(BaseModel):
    github_id: int
    username: str
    email: EmailStr


class UserDTO(BaseSchema):
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
    is_org_member: bool = False
    is_admin: bool = False


class UserUpdateDTO(BaseModel):
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
