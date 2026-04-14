from app.application.dto.admin import (
    AdminUserDetailDTO,
    AdminUserUpdateDTO,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.user_repository import UserRepository


class UpdateAdminUserUseCase:
    def __init__(
        self,
        user_repo: UserRepository,
        admin_repo: AdminRepository,
    ):
        self.user_repo = user_repo
        self.admin_repo = admin_repo

    async def execute(
        self,
        user_id: int,
        data: AdminUserUpdateDTO,
        admin_id: int,
    ) -> AdminUserDetailDTO:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            logger.warning(
                f'Admin update user failed: {user_id}',
                extra={'extra_data': {
                    'event': 'admin_update_user_failed',
                    'reason': 'user_not_found',
                    'target_user_id': user_id,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceNotFound('User not found')

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(user, key, value)

        await self.user_repo.update(user)

        logger.info(
            f'Admin updated user: {user_id}',
            extra={'extra_data': {
                'event': 'admin_update_user',
                'target_user_id': user_id,
                'admin_id': admin_id,
                'fields_updated': list(update_data.keys()),
            }},
        )

        detail = await self.admin_repo.get_user_detail(user_id)
        return AdminUserDetailDTO(**detail)
