from fastapi import APIRouter

from app.presentation.dependencies import CurrentUserDp
from app.presentation.schemas.user import UserProfile

router = APIRouter(tags=["Users"])


@router.get("/users/me", response_model=UserProfile)
def get_me(c_user: CurrentUserDp):
    print(c_user.model_dump())
    return UserProfile.model_validate(c_user)
