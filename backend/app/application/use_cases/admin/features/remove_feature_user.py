from app.application.use_cases.admin.features.common import load_feature
from app.config.logging import logger
from app.domain.repositories.feature_repository import FeatureRepository


class RemoveFeatureUserUseCase:
    """Take a user off a feature's beta list, in either stage (R-009,
    R-011). Not on it is a no-op; an unknown user too."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(self, key: str, user_id: int, admin_id: int) -> None:
        feature = await load_feature(self.feature_repo, key)
        await self.feature_repo.remove_user(feature.id, user_id)
        logger.info(
            'Admin removed a user from a feature beta list',
            extra={
                'extra_data': {
                    'event': 'admin_remove_feature_user',
                    'admin_id': admin_id,
                    'feature': key,
                    'user_id': user_id,
                }
            },
        )
