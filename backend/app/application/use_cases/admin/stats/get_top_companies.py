from app.application.dto.admin import TopCompanyStatDTO
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class GetTopCompaniesUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, admin_id: int
    ) -> list[TopCompanyStatDTO]:
        logger.info(
            'Admin fetched top companies',
            extra={'extra_data': {
                'event': 'admin_get_top_companies',
                'admin_id': admin_id,
            }},
        )
        rows = await self.admin_repo.get_top_companies()
        return [TopCompanyStatDTO(**r) for r in rows]
