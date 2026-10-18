"""Seed helpers for the beta features (KODI-052, ADR-0018).

``create_all`` builds the three tables but not revision ``641001baff09``'s
seed row, so :func:`seed_jobs_feature` inserts the ``jobs`` feature exactly
as the migration does: ``beta``, ``released_at`` NULL, no beta-list row and
no opt-out row. :func:`seed_cvs_feature` does the same for ``cvs`` with
revision ``f28e3d9705dd``'s name and description (its beta list is the
test's own business: ``enrol`` the users it needs).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    FeatureAdminOptOutModel,
    FeatureBetaUserModel,
    FeatureModel,
)

JOBS_FEATURE_ID = 8200000000000000001
JOBS_NAME = 'Job board'
JOBS_DESCRIPTION = 'Remote job list, CV fit and keyword tailoring (PRD 0012)'

CVS_FEATURE_ID = 8200000000000000002
CVS_NAME = 'CV builder'
CVS_DESCRIPTION = (
    'Master CVs, CV copies on applications and the new application with '
    'CV flow.'
)


async def seed_jobs_feature(session: AsyncSession) -> int:
    session.add(
        FeatureModel(
            id=JOBS_FEATURE_ID,
            key='jobs',
            name=JOBS_NAME,
            description=JOBS_DESCRIPTION,
            stage='beta',
            released_at=None,
        )
    )
    await session.commit()
    return JOBS_FEATURE_ID


async def seed_cvs_feature(session: AsyncSession) -> int:
    session.add(
        FeatureModel(
            id=CVS_FEATURE_ID,
            key='cvs',
            name=CVS_NAME,
            description=CVS_DESCRIPTION,
            stage='beta',
            released_at=None,
        )
    )
    await session.commit()
    return CVS_FEATURE_ID


async def enrol(
    session: AsyncSession,
    user_id: int,
    feature_id: int = JOBS_FEATURE_ID,
    added_by: int | None = None,
) -> None:
    session.add(
        FeatureBetaUserModel(
            feature_id=feature_id, user_id=user_id, added_by=added_by
        )
    )
    await session.commit()


async def opt_out(
    session: AsyncSession, user_id: int, feature_id: int = JOBS_FEATURE_ID
) -> None:
    session.add(FeatureAdminOptOutModel(feature_id=feature_id, user_id=user_id))
    await session.commit()
