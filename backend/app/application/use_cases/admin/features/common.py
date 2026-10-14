"""Shared by the admin feature use cases: the unknown-key 404 and the
row -> DTO map with the calling admin's own access."""

from app.application.dto.feature import FeatureAccessDTO, FeatureAdminDTO
from app.core.exceptions import ResourceNotFound
from app.core.features import FeatureStage, access_via
from app.domain.models import FeatureModel
from app.domain.repositories.feature_repository import (
    FeatureRepository,
    FeatureRow,
)

FEATURE_NOT_FOUND = 'Feature not found'


async def load_feature(repo: FeatureRepository, key: str) -> FeatureModel:
    feature = await repo.get_by_key(key)
    if feature is None:
        raise ResourceNotFound(FEATURE_NOT_FOUND)
    return feature


def to_admin_dto(row: FeatureRow) -> FeatureAdminDTO:
    """The row as the calling admin sees it; ``me`` runs the rule for an
    admin (the admin routes are behind ``AdminUserDp``)."""
    via = access_via(
        row.stage, listed=row.listed, is_admin=True, opted_out=row.opted_out
    )
    return FeatureAdminDTO(
        id=row.id,
        key=row.key,
        name=row.name,
        description=row.description,
        stage=FeatureStage(row.stage),
        beta_user_count=row.beta_user_count,
        released_at=row.released_at,
        updated_at=row.updated_at,
        me=FeatureAccessDTO(
            has=via is not None, via=via, opted_out=row.opted_out
        ),
    )
