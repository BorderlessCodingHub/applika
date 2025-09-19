from fastapi import APIRouter
from typing import List

from app.presentation.dependencies import CurrentUserDp
from app.presentation.schemas.user import UserProfile

router = APIRouter(prefix="/profile", tags=["User Profile"])


@router.get("/me", response_model=UserProfile)
def get_me(c_user: CurrentUserDp):
    print(c_user.model_dump())
    return UserProfile.model_validate(c_user)
