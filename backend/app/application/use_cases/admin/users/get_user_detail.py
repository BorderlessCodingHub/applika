from app.application.dto.admin import AdminUserDetailDTO
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.admin_repository import AdminRepository


class GetAdminUserDetailUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, user_id: int, admin_id: int
    ) -> AdminUserDetailDTO:
        detail = await self.admin_repo.get_user_detail(
            user_id
        )
        if not detail:
            logger.warning(
                f'Admin user detail not found: {user_id}',
                extra={'extra_data': {
                    'event': 'admin_get_user_detail_failed',
                    'reason': 'user_not_found',
                    'target_user_id': user_id,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceNotFound('User not found')

        logger.info(
            f'Admin viewed user detail: {user_id}',
            extra={'extra_data': {
                'event': 'admin_get_user_detail',
                'target_user_id': user_id,
                'admin_id': admin_id,
            }},
        )
        return AdminUserDetailDTO(**detail)
