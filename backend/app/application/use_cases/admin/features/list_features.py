from app.application.dto.feature import FeatureAdminDTO
from app.application.use_cases.admin.features.common import to_admin_dto
from app.config.logging import logger
from app.domain.repositories.feature_repository import FeatureRepository


class ListFeaturesUseCase:
    """Every feature by key, with its beta-list count and the calling
    admin's own access (R-006)."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(self, admin_id: int) -> list[FeatureAdminDTO]:
        rows = await self.feature_repo.list_with_counts(admin_id)
        logger.info(
            'Admin listed features',
            extra={
                'extra_data': {
                    'event': 'admin_list_features',
                    'admin_id': admin_id,
                }
            },
        )
        return [to_admin_dto(row) for row in rows]
