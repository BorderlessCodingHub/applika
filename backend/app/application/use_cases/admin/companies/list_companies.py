import math

from app.application.dto.admin import (
    AdminCompanyRowDTO,
    PaginatedCompaniesDTO,
)
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class ListAdminCompaniesUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self,
        admin_id: int,
        search: str | None = None,
        is_active: bool | None = None,
        sort_by: str = 'name',
        sort_order: str = 'asc',
        page: int = 1,
        per_page: int = 25,
    ) -> PaginatedCompaniesDTO:
        logger.info(
            'Admin listed companies',
            extra={'extra_data': {
                'event': 'admin_list_companies',
                'admin_id': admin_id,
                'search': search,
                'is_active': is_active,
                'page': page,
            }},
        )
        rows, total = await self.admin_repo.get_admin_companies(
            search=search,
            is_active=is_active,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            per_page=per_page,
        )
        return PaginatedCompaniesDTO(
            items=[AdminCompanyRowDTO(**r) for r in rows],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(
                math.ceil(total / per_page) if total else 0
            ),
        )
