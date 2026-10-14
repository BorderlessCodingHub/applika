from app.application.dto.feature import FeatureAdminDTO
from app.application.use_cases.admin.features.common import (
    load_feature,
    to_admin_dto,
)
from app.config.logging import logger
from app.core.features import FeatureStage
from app.domain.repositories.feature_repository import FeatureRepository


class SetFeatureStageUseCase:
    """Release a feature (``general``) or move it back to ``beta`` (R-010,
    R-011). The same stage is a no-op answering the row; the beta list and
    the opt-outs are never touched."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(
        self, key: str, stage: FeatureStage, admin_id: int
    ) -> FeatureAdminDTO:
        feature = await load_feature(self.feature_repo, key)
        previous = feature.stage
        if previous != stage.value:
            await self.feature_repo.set_stage(feature.id, stage)
            logger.info(
                f'Admin moved feature {key} to {stage.value}',
                extra={
                    'extra_data': {
                        'event': 'admin_set_feature_stage',
                        'admin_id': admin_id,
                        'feature': key,
                        'from': previous,
                        'to': stage.value,
                    }
                },
            )
        row = await self.feature_repo.get_row(feature.id, admin_id)
        return to_admin_dto(row)
