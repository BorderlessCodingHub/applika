"""Admin beta features (KODI-052, ADR-0018): every feature with its beta
list count, a feature's beta list (list, add, remove), release and move
back to beta, and the calling admin's own opt-out. Admin only
(``AdminUserDp``, ADR-0004); a feature is never created, renamed or deleted
here - it joins through an Alembic seed row. Never gated by
``require_feature``.
"""

from typing import Any

from fastapi import APIRouter, Query, Response

from app.application.use_cases.admin.features.add_feature_user import (
    AddFeatureUserUseCase,
)
from app.application.use_cases.admin.features.list_feature_users import (
    ListFeatureUsersUseCase,
)
from app.application.use_cases.admin.features.list_features import (
    ListFeaturesUseCase,
)
from app.application.use_cases.admin.features.opt_in import (
    OptInFeatureUseCase,
)
from app.application.use_cases.admin.features.opt_out import (
    OptOutFeatureUseCase,
)
from app.application.use_cases.admin.features.remove_feature_user import (
    RemoveFeatureUserUseCase,
)
from app.application.use_cases.admin.features.set_feature_stage import (
    SetFeatureStageUseCase,
)
from app.core.features import FeatureStage
from app.lib.types import SnowflakeID
from app.presentation.dependencies import AdminUserDp, FeatureRepositoryDp
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.features import (
    FeatureAdminRow,
    FeatureStageUpdate,
    FeatureUsersPage,
)

router = APIRouter(
    prefix='/admin/features',
    tags=['Admin - Features'],
    responses={
        '401': {'model': DetailSchema},
        '403': {'model': DetailSchema},
    },
)

NOT_FOUND: dict[int | str, dict[str, Any]] = {'404': {'model': DetailSchema}}


@router.get('', response_model=list[FeatureAdminRow])
async def list_features(admin: AdminUserDp, feature_repo: FeatureRepositoryDp):
    """Every feature by key: its stage, beta-list count, release date and
    whether the calling admin has it, and why."""
    rows = await ListFeaturesUseCase(feature_repo).execute(admin.id)
    return [FeatureAdminRow.model_validate(row) for row in rows]


@router.patch('/{key}', response_model=FeatureAdminRow, responses=NOT_FOUND)
async def set_feature_stage(
    key: str,
    body: FeatureStageUpdate,
    admin: AdminUserDp,
    feature_repo: FeatureRepositoryDp,
):
    """Release (``general``) or move back to ``beta``. The same stage is a
    no-op; the beta list and the opt-outs are untouched."""
    row = await SetFeatureStageUseCase(feature_repo).execute(
        key, FeatureStage(body.stage), admin.id
    )
    return FeatureAdminRow.model_validate(row)


@router.get(
    '/{key}/users', response_model=FeatureUsersPage, responses=NOT_FOUND
)
async def list_feature_users(
    key: str,
    admin: AdminUserDp,
    feature_repo: FeatureRepositoryDp,
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    """The beta list, newest first: username, email, when added, by whom."""
    page_dto = await ListFeatureUsersUseCase(feature_repo).execute(
        key, admin.id, search, page, per_page
    )
    return FeatureUsersPage.model_validate(page_dto)


@router.put('/{key}/users/{user_id}', status_code=204, responses=NOT_FOUND)
async def add_feature_user(
    key: str,
    user_id: SnowflakeID,
    admin: AdminUserDp,
    feature_repo: FeatureRepositoryDp,
):
    """Put the user on the beta list; already on it is a no-op."""
    await AddFeatureUserUseCase(feature_repo).execute(key, user_id, admin.id)
    return Response(status_code=204)


@router.delete('/{key}/users/{user_id}', status_code=204, responses=NOT_FOUND)
async def remove_feature_user(
    key: str,
    user_id: SnowflakeID,
    admin: AdminUserDp,
    feature_repo: FeatureRepositoryDp,
):
    """Take the user off the beta list; not on it is a no-op."""
    await RemoveFeatureUserUseCase(feature_repo).execute(key, user_id, admin.id)
    return Response(status_code=204)


@router.put('/{key}/opt-out', status_code=204, responses=NOT_FOUND)
async def opt_out(
    key: str, admin: AdminUserDp, feature_repo: FeatureRepositoryDp
):
    """Turn the feature off for the calling admin only. Stored in either
    stage; it counts only while the feature is in beta."""
    await OptOutFeatureUseCase(feature_repo).execute(key, admin.id)
    return Response(status_code=204)


@router.delete('/{key}/opt-out', status_code=204, responses=NOT_FOUND)
async def opt_in(
    key: str, admin: AdminUserDp, feature_repo: FeatureRepositoryDp
):
    """Turn the feature back on for the calling admin only."""
    await OptInFeatureUseCase(feature_repo).execute(key, admin.id)
    return Response(status_code=204)
