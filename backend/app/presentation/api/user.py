from fastapi import APIRouter

from app.application.dto.user import UserUpdateDTO
from app.application.use_cases.update_user import UpdateUserUseCase
from app.presentation.dependencies import CurrentUserDp, UserRepositoryDp
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.user import UpdateUserProfile, UserProfile

router = APIRouter(tags=['Users'], responses={'403': {'model': DetailSchema}})


@router.get('/users/me', response_model=UserProfile)
def get_me(c_user: CurrentUserDp):
    return UserProfile.model_validate(c_user)


@router.patch('/users/me', response_model=UserProfile)
async def update_me(
    payload: UpdateUserProfile,
    c_user: CurrentUserDp,
    user_repo: UserRepositoryDp,
):
    use_case = UpdateUserUseCase(user_repo)
    data = UserUpdateDTO(**payload.model_dump(exclude_unset=True))
    user = await use_case.execute(c_user.id, data)
    return UserProfile.model_validate(user)
