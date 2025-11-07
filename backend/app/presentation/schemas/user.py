from typing import List

from pydantic import EmailStr

from app.presentation.schemas import BaseSchema, TimeSchema


class UserProfile(BaseSchema, TimeSchema):
    id: int
    github_id: str
    username: str
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    tech_stack: List[str]
    current_company: str | None = None
    current_salary: float | None = None
    tech_stack: list[str] | None = None
    experience_years: int = 0
