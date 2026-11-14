from app.application.use_cases.admin.features.common import load_feature
from app.config.logging import logger
from app.domain.repositories.feature_repository import FeatureRepository


class OptOutFeatureUseCase:
    """The calling admin turns a feature off for themselves (R-014). Only
    their own row; stored in either stage, counting only in ``beta``
    (R-015, R-016). Already off is a no-op."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(self, key: str, admin_id: int) -> None:
        feature = await load_feature(self.feature_repo, key)
        await self.feature_repo.opt_out(feature.id, admin_id)
        logger.info(
            f'Admin turned feature {key} off for themselves',
            extra={
                'extra_data': {
                    'event': 'admin_feature_opt_out',
                    'admin_id': admin_id,
                    'feature': key,
                }
            },
        )
