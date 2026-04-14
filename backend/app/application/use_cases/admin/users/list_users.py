import math

from app.application.dto.admin import (
    AdminUserRowDTO,
    PaginatedUsersDTO,
)
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class ListAdminUsersUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self,
        admin_id: int,
        search: str | None = None,
        seniority: str | None = None,
        sort_by: str = 'joined_at',
        sort_order: str = 'desc',
        page: int = 1,
        per_page: int = 25,
    ) -> PaginatedUsersDTO:
        logger.info(
            'Admin listed users',
            extra={'extra_data': {
                'event': 'admin_list_users',
                'admin_id': admin_id,
                'search': search,
                'seniority': seniority,
                'page': page,
            }},
        )
        rows, total = await self.admin_repo.get_user_rows(
            search=search,
            seniority=seniority,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            per_page=per_page,
        )
        return PaginatedUsersDTO(
            items=[AdminUserRowDTO(**r) for r in rows],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(
                math.ceil(total / per_page) if total else 0
            ),
        )
