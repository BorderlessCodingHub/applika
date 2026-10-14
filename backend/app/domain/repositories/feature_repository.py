"""Beta features (KODI-052, ADR-0018): the registry, the beta lists and the
admins' own opt-outs.

The access rule is one predicate, run as ONE query per check and never
cached (R-012): the feature is ``general``, OR a ``(feature, user)``
beta-list row exists, OR the user is an admin with no ``(feature, user)``
opt-out row. It mirrors ``app.core.features.access_via``. A key with no
``features`` row matches nothing, so it is hidden from everyone, admins
included (R-003).

``features`` is a shared catalog with no owner (ADR-0004: admin-managed);
the beta list is written only by admins; an opt-out row is written only by
the admin it belongs to (the use cases pass the caller's own id).
"""

from datetime import datetime
from typing import NamedTuple

from sqlalchemy import (
    ColumnElement,
    and_,
    delete,
    exists,
    false,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.features import FeatureStage
from app.domain.models import (
    FeatureAdminOptOutModel,
    FeatureBetaUserModel,
    FeatureModel,
    UserModel,
)
from app.lib.types import generate_snowflake_id


def _escape_like(value: str) -> str:
    """``value`` as a literal ``ILIKE`` pattern part: ``%``, ``_`` and the
    escape character itself match only themselves."""
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


class FeatureFlags(NamedTuple):
    """One feature as one user sees it: its row plus the two facts the
    rule reads for that user."""

    key: str
    stage: str
    listed: bool
    opted_out: bool


class FeatureRow(NamedTuple):
    """One feature on the admin list, with the caller's own two facts."""

    id: int
    key: str
    name: str
    description: str | None
    stage: str
    released_at: datetime | None
    updated_at: datetime
    beta_user_count: int
    listed: bool
    opted_out: bool


class FeatureUserRow(NamedTuple):
    """One beta-list row with its user and the admin who added them."""

    user_id: int
    username: str
    email: str
    added_at: datetime
    added_by_id: int | None
    added_by_username: str | None


def _listed(user_id: int) -> ColumnElement[bool]:
    return exists().where(
        FeatureBetaUserModel.feature_id == FeatureModel.id,
        FeatureBetaUserModel.user_id == user_id,
    )


def _opted_out(user_id: int) -> ColumnElement[bool]:
    return exists().where(
        FeatureAdminOptOutModel.feature_id == FeatureModel.id,
        FeatureAdminOptOutModel.user_id == user_id,
    )


def access_predicate(user_id: int, is_admin: bool) -> ColumnElement[bool]:
    """The access rule (ADR-0018) as SQL over ``features``: general, OR on
    the beta list, OR an admin with no opt-out. ``is_admin`` is the
    caller's current ``users.is_admin``, so an opt-out row left by a former
    admin grants nothing."""
    admin_access = ~_opted_out(user_id) if is_admin else false()
    return or_(
        FeatureModel.stage == FeatureStage.GENERAL.value,
        _listed(user_id),
        admin_access,
    )


class FeatureRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_key(self, key: str) -> FeatureModel | None:
        return await self.session.scalar(
            select(FeatureModel).where(FeatureModel.key == key)
        )

    async def features_for_user(
        self, user_id: int, is_admin: bool
    ) -> list[FeatureFlags]:
        """Every feature the user has, by key - one query."""
        result = await self.session.execute(
            select(
                FeatureModel.key,
                FeatureModel.stage,
                _listed(user_id).label('listed'),
                _opted_out(user_id).label('opted_out'),
            )
            .where(access_predicate(user_id, is_admin))
            .order_by(FeatureModel.key)
        )
        return [FeatureFlags(*row) for row in result.all()]

    async def has_feature(self, key: str, user_id: int, is_admin: bool) -> bool:
        """Whether the user has the feature ``key`` - one indexed query. No
        row for ``key`` is False for everyone, admins too (R-003)."""
        found = await self.session.scalar(
            select(
                exists().where(
                    and_(
                        FeatureModel.key == key,
                        access_predicate(user_id, is_admin),
                    )
                )
            )
        )
        return bool(found)

    def _row_select(self, caller_id: int):
        beta_count = (
            select(func.count(FeatureBetaUserModel.id))
            .where(FeatureBetaUserModel.feature_id == FeatureModel.id)
            .scalar_subquery()
        )
        return select(
            FeatureModel.id,
            FeatureModel.key,
            FeatureModel.name,
            FeatureModel.description,
            FeatureModel.stage,
            FeatureModel.released_at,
            func.coalesce(
                FeatureModel.updated_at, FeatureModel.created_at
            ).label('updated_at'),
            beta_count.label('beta_user_count'),
            _listed(caller_id).label('listed'),
            _opted_out(caller_id).label('opted_out'),
        )

    async def list_with_counts(self, caller_id: int) -> list[FeatureRow]:
        """Every feature by key. ``beta_user_count`` counts beta-list rows
        only - an admin with access only as an admin is not on it (R-006).
        ``listed`` / ``opted_out`` are the caller's own."""
        result = await self.session.execute(
            self._row_select(caller_id).order_by(FeatureModel.key)
        )
        return [FeatureRow(*row) for row in result.all()]

    async def get_row(self, feature_id: int, caller_id: int) -> FeatureRow:
        result = await self.session.execute(
            self._row_select(caller_id).where(FeatureModel.id == feature_id)
        )
        return FeatureRow(*result.one())

    async def list_users(
        self,
        feature_id: int,
        search: str | None,
        page: int,
        per_page: int,
    ) -> tuple[list[FeatureUserRow], int]:
        """The feature's beta list, newest first, searched by username
        (``ILIKE``, its wildcards escaped), one page of it plus the total."""
        adder = aliased(UserModel)
        stmt = (
            select(
                UserModel.id,
                UserModel.username,
                UserModel.email,
                FeatureBetaUserModel.created_at,
                adder.id,
                adder.username,
            )
            .select_from(FeatureBetaUserModel)
            .join(UserModel, UserModel.id == FeatureBetaUserModel.user_id)
            .outerjoin(adder, adder.id == FeatureBetaUserModel.added_by)
            .where(FeatureBetaUserModel.feature_id == feature_id)
        )
        if search:
            stmt = stmt.where(
                UserModel.username.ilike(
                    f'%{_escape_like(search)}%', escape='\\'
                )
            )
        total = await self.session.scalar(
            select(func.count()).select_from(stmt.subquery())
        )
        result = await self.session.execute(
            stmt
            .order_by(
                FeatureBetaUserModel.created_at.desc(),
                FeatureBetaUserModel.id.desc(),
            )
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        return [FeatureUserRow(*row) for row in result.all()], total or 0

    async def user_exists(self, user_id: int) -> bool:
        found = await self.session.scalar(
            select(exists().where(UserModel.id == user_id))
        )
        return bool(found)

    async def add_user(
        self, feature_id: int, user_id: int, added_by: int
    ) -> bool:
        """Put the user on the beta list; already there is a no-op. False
        when the user row is gone (FK), so the caller answers 404."""
        try:
            await self.session.execute(
                insert(FeatureBetaUserModel)
                .values(
                    id=generate_snowflake_id(),
                    feature_id=feature_id,
                    user_id=user_id,
                    added_by=added_by,
                )
                .on_conflict_do_nothing(
                    constraint='uq_feature_beta_users_feature_user'
                )
            )
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            return False
        except Exception:
            await self.session.rollback()
            raise
        return True

    async def remove_user(self, feature_id: int, user_id: int) -> None:
        """Take the user off the beta list; not there is a no-op."""
        await self._delete(FeatureBetaUserModel, feature_id, user_id)

    async def opt_out(self, feature_id: int, user_id: int) -> None:
        """Store the admin's own opt-out; already there is a no-op."""
        try:
            await self.session.execute(
                insert(FeatureAdminOptOutModel)
                .values(
                    id=generate_snowflake_id(),
                    feature_id=feature_id,
                    user_id=user_id,
                )
                .on_conflict_do_nothing(
                    constraint='uq_feature_admin_opt_outs_feature_user'
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def opt_in(self, feature_id: int, user_id: int) -> None:
        """Remove the admin's own opt-out; none is a no-op."""
        await self._delete(FeatureAdminOptOutModel, feature_id, user_id)

    async def clear_opt_outs(self, user_id: int) -> None:
        """Remove every opt-out of one user. Used only by the E2E seed
        (``app/scripts/seed_e2e.py``), never by a route."""
        try:
            await self.session.execute(
                delete(FeatureAdminOptOutModel).where(
                    FeatureAdminOptOutModel.user_id == user_id
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def _delete(
        self,
        model: type[FeatureBetaUserModel] | type[FeatureAdminOptOutModel],
        feature_id: int,
        user_id: int,
    ) -> None:
        try:
            await self.session.execute(
                delete(model).where(
                    model.feature_id == feature_id, model.user_id == user_id
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def set_stage(self, feature_id: int, stage: FeatureStage) -> None:
        """Move the feature to ``stage``: ``general`` sets ``released_at``,
        ``beta`` clears it. The beta list and the opt-outs are untouched
        (R-011, R-016)."""
        try:
            await self.session.execute(
                update(FeatureModel)
                .where(FeatureModel.id == feature_id)
                .values(
                    stage=stage.value,
                    released_at=(
                        func.now() if stage == FeatureStage.GENERAL else None
                    ),
                    updated_at=func.now(),
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
