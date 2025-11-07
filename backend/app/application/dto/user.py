from typing import List

from pydantic import BaseModel, EmailStr

from app.application.dto import BaseSchema


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
    tech_stack: List[str] | None = None
    current_company: str | None = None
    current_salary: float | None = None
    tech_stack: list[str] | None = None
    experience_years: int = 0
