from fastapi import APIRouter
from typing import List

from app.presentation.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=List[UserResponse])
async def list_users():
    return [
        UserResponse(id=1, name="Example User", email="user@example.com")
    ]
