from app.application.dto.admin import SeniorityBreakdownDTO
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class GetSeniorityBreakdownUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self, admin_id: int
    ) -> list[SeniorityBreakdownDTO]:
        logger.info(
            'Admin fetched seniority breakdown',
            extra={'extra_data': {
                'event': 'admin_get_seniority_breakdown',
                'admin_id': admin_id,
            }},
        )
        rows = await self.admin_repo.get_seniority_breakdown()
        return [SeniorityBreakdownDTO(**r) for r in rows]
