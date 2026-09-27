import math

from app.application.dto.admin import (
    AdminPlatformRowDTO,
    PaginatedPlatformsDTO,
)
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository


class ListAdminPlatformsUseCase:
    def __init__(self, admin_repo: AdminRepository):
        self.admin_repo = admin_repo

    async def execute(
        self,
        admin_id: int,
        search: str | None = None,
        visibility: str | None = None,
        sort_by: str = 'name',
        sort_order: str = 'asc',
        page: int = 1,
        per_page: int = 25,
    ) -> PaginatedPlatformsDTO:
        logger.info(
            'Admin listed platforms',
            extra={
                'extra_data': {
                    'event': 'admin_list_platforms',
                    'admin_id': admin_id,
                    'search': search,
                    'visibility': visibility,
                    'page': page,
                }
            },
        )
        rows, total = await self.admin_repo.get_admin_platforms(
            search=search,
            visibility=visibility,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            per_page=per_page,
        )
        return PaginatedPlatformsDTO(
            items=[AdminPlatformRowDTO(**r) for r in rows],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(math.ceil(total / per_page) if total else 0),
        )
