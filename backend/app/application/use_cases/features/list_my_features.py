from app.application.dto.feature import MyFeatureDTO
from app.core.features import FeatureStage
from app.domain.repositories.feature_repository import FeatureRepository


class ListMyFeaturesUseCase:
    """The features the caller has, by key, with their stages - the caller's
    own only, decided by the one access query (ADR-0018)."""

    def __init__(self, feature_repo: FeatureRepository):
        self.feature_repo = feature_repo

    async def execute(self, user_id: int, is_admin: bool) -> list[MyFeatureDTO]:
        flags = await self.feature_repo.features_for_user(user_id, is_admin)
        return [
            MyFeatureDTO(key=flag.key, stage=FeatureStage(flag.stage))
            for flag in flags
        ]
