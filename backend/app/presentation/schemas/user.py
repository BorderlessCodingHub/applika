from pydantic import EmailStr

from app.presentation.schemas import BaseSchema


class UserCreate(BaseSchema):
    email: EmailStr
    name: str


class UserResponse(UserCreate):
    id: int
