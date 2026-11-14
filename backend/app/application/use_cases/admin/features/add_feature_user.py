from app.application.use_cases.admin.features.common import load_feature
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.feature_repository import FeatureRepository

USER_NOT_FOUND = 'User not found'


class AddFeatureUserUseCase:
    """Put a user on a feature's beta list, in either stage (R-008, R-011).
    Already on it is a no-op."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(self, key: str, user_id: int, admin_id: int) -> None:
        feature = await load_feature(self.feature_repo, key)
        if not await self.feature_repo.user_exists(user_id):
            raise ResourceNotFound(USER_NOT_FOUND, ErrorCode.USR_USER_NOT_FOUND)
        if not await self.feature_repo.add_user(feature.id, user_id, admin_id):
            raise ResourceNotFound(USER_NOT_FOUND, ErrorCode.USR_USER_NOT_FOUND)
        logger.info(
            'Admin added a user to a feature beta list',
            extra={
                'extra_data': {
                    'event': 'admin_add_feature_user',
                    'admin_id': admin_id,
                    'feature': key,
                    'user_id': user_id,
                }
            },
        )
