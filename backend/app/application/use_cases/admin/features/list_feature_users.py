import math

from app.application.dto.feature import (
    FeatureUserDTO,
    FeatureUsersPageDTO,
    UserRefDTO,
)
from app.application.use_cases.admin.features.common import load_feature
from app.config.logging import logger
from app.domain.repositories.feature_repository import FeatureRepository


class ListFeatureUsersUseCase:
    """One page of a feature's beta list, newest first, searched by
    username (R-007)."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(
        self,
        key: str,
        admin_id: int,
        search: str | None,
        page: int,
        per_page: int,
    ) -> FeatureUsersPageDTO:
        feature = await load_feature(self.feature_repo, key)
        rows, total = await self.feature_repo.list_users(
            feature.id, search, page, per_page
        )
        logger.info(
            'Admin listed a feature beta list',
            extra={
                'extra_data': {
                    'event': 'admin_list_feature_users',
                    'admin_id': admin_id,
                    'feature': key,
                    'page': page,
                }
            },
        )
        return FeatureUsersPageDTO(
            items=[
                FeatureUserDTO(
                    user_id=row.user_id,
                    username=row.username,
                    email=row.email,
                    added_at=row.added_at,
                    added_by=(
                        UserRefDTO(
                            id=row.added_by_id,
                            username=row.added_by_username or '',
                        )
                        if row.added_by_id is not None
                        else None
                    ),
                )
                for row in rows
            ],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=math.ceil(total / per_page) if total else 0,
        )
