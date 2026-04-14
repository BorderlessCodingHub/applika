from app.application.dto.admin import UserGrowthPointDTO
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class GetUserGrowthUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, admin_id: int
    ) -> list[UserGrowthPointDTO]:
        logger.info(
            'Admin fetched user growth',
            extra={'extra_data': {
                'event': 'admin_get_user_growth',
                'admin_id': admin_id,
            }},
        )
        rows = await self.admin_repo.get_user_growth()
        return [UserGrowthPointDTO(**r) for r in rows]
