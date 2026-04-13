from datetime import datetime, timedelta
from typing import List

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    CompanyModel,
    FeedbackDefinitionModel,
    PlatformModel,
    UserModel,
)


class AdminRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _get_accepted_feedback_id(self) -> int | None:
        """Get the ID of the 'Accepted' feedback definition."""
        return await self.session.scalar(
            select(FeedbackDefinitionModel.id).where(
                FeedbackDefinitionModel.name == 'Accepted'
            )
        )

    async def get_platform_stats(self) -> dict:
        total_users = await self.session.scalar(
            select(func.count(UserModel.id))
        )

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        active_users_subq = (
            select(ApplicationModel.user_id)
            .where(ApplicationModel.created_at >= thirty_days_ago)
            .union(
                select(ApplicationStepModel.user_id).where(
                    ApplicationStepModel.created_at >= thirty_days_ago
                )
            )
            .subquery()
        )
        active_users_30d = await self.session.scalar(
            select(func.count()).select_from(active_users_subq)
        )

        total_applications = await self.session.scalar(
            select(func.count(ApplicationModel.id))
        )

        total_finalized = await self.session.scalar(
            select(func.count(ApplicationModel.id)).where(
                ApplicationModel.feedback_id.isnot(None),
            )
        )

        accepted_id = await self._get_accepted_feedback_id()

        total_offers = 0
        total_denials = 0
        if accepted_id is not None:
            total_offers = await self.session.scalar(
                select(func.count(ApplicationModel.id)).where(
                    ApplicationModel.feedback_id == accepted_id,
                )
            ) or 0
            total_denials = (total_finalized or 0) - total_offers
        else:
            total_denials = total_finalized or 0

        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        new_users_7d = await self.session.scalar(
            select(func.count(UserModel.id)).where(
                UserModel.created_at >= seven_days_ago
            )
        )

        # Applications in last 30 days
        apps_last_30d = await self.session.scalar(
            select(func.count(ApplicationModel.id)).where(
                ApplicationModel.created_at >= thirty_days_ago
            )
        ) or 0

        avg_apps = (
            round(total_applications / total_users, 1)
            if total_users
            else 0
        )
        success_rate = (
            round((total_offers / total_applications) * 100, 1)
            if total_applications
            else 0
        )
        finalization_rate = (
            round(
                ((total_finalized or 0) / total_applications) * 100,
                1,
            )
            if total_applications
            else 0
        )

        return {
            'total_users': total_users or 0,
            'active_users_30d': active_users_30d or 0,
            'total_applications': total_applications or 0,
            'total_offers': total_offers,
            'total_denials': total_denials,
            'avg_applications_per_user': avg_apps,
            'global_success_rate': success_rate,
            'new_users_7d': new_users_7d or 0,
            'total_finalized': total_finalized or 0,
            'finalization_rate': finalization_rate,
            'applications_last_30d': apps_last_30d,
        }

    async def get_user_rows(
        self,
        search: str | None = None,
        seniority: str | None = None,
        sort_by: str = 'joined_at',
        sort_order: str = 'desc',
        page: int = 1,
        per_page: int = 25,
    ) -> tuple[list, int]:
        accepted_id = await self._get_accepted_feedback_id()

        # Subquery for application counts per user
        app_counts = (
            select(
                ApplicationModel.user_id,
                func.count(ApplicationModel.id).label('total_applications'),
                func.count(
                    sa.case(
                        (
                            ApplicationModel.feedback_id == accepted_id,
                            1,
                        )
                    )
                ).label('offers'),
                func.count(
                    sa.case(
                        (
                            sa.and_(
                                ApplicationModel.feedback_id.isnot(None),
                                ApplicationModel.feedback_id != accepted_id,
                            ),
                            1,
                        )
                    )
                ).label('denials'),
                func.count(
                    sa.case(
                        (ApplicationModel.feedback_id.is_(None), 1)
                    )
                ).label('active_applications'),
                func.max(ApplicationModel.created_at).label(
                    'last_activity'
                ),
            )
            .group_by(ApplicationModel.user_id)
            .subquery('app_counts')
        )

        stmt = (
            select(
                UserModel.id,
                UserModel.username,
                UserModel.email,
                UserModel.github_id,
                UserModel.seniority_level,
                UserModel.location,
                UserModel.is_admin,
                func.coalesce(
                    app_counts.c.total_applications, 0
                ).label('total_applications'),
                func.coalesce(app_counts.c.offers, 0).label('offers'),
                func.coalesce(app_counts.c.denials, 0).label('denials'),
                func.coalesce(
                    app_counts.c.active_applications, 0
                ).label('active_applications'),
                func.coalesce(
                    app_counts.c.last_activity, UserModel.created_at
                ).label('last_activity'),
                UserModel.created_at.label('joined_at'),
            )
            .outerjoin(
                app_counts, UserModel.id == app_counts.c.user_id
            )
        )

        # Filters
        if search:
            stmt = stmt.where(
                sa.or_(
                    UserModel.username.ilike(f'%{search}%'),
                    UserModel.email.ilike(f'%{search}%'),
                )
            )
        if seniority:
            stmt = stmt.where(
                UserModel.seniority_level == seniority
            )

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt)

        # Sorting
        sort_columns = {
            'username': UserModel.username,
            'joined_at': UserModel.created_at,
            'last_activity': 'last_activity',
            'total_applications': 'total_applications',
        }
        sort_col = sort_columns.get(sort_by, UserModel.created_at)
        if isinstance(sort_col, str):
            sort_col = sa.literal_column(sort_col)

        if sort_order == 'asc':
            stmt = stmt.order_by(sa.asc(sort_col))
        else:
            stmt = stmt.order_by(sa.desc(sort_col))

        # Pagination
        stmt = stmt.offset((page - 1) * per_page).limit(per_page)

        result = await self.session.execute(stmt)
        rows = result.mappings().all()

        return rows, total or 0

    async def get_user_growth(
        self, months: int = 12
    ) -> List[dict]:
        cutoff = datetime.utcnow() - timedelta(days=months * 30)

        stmt = (
            select(
                func.date_trunc('month', UserModel.created_at).label(
                    'month'
                ),
                func.count(UserModel.id).label('new_users'),
            )
            .where(UserModel.created_at >= cutoff)
            .group_by(sa.literal_column('month'))
            .order_by(sa.literal_column('month'))
        )

        result = await self.session.execute(stmt)
        rows = result.mappings().all()

        # Build cumulative data
        # First get total users before cutoff
        users_before = await self.session.scalar(
            select(func.count(UserModel.id)).where(
                UserModel.created_at < cutoff
            )
        ) or 0

        points = []
        cumulative = users_before
        for row in rows:
            cumulative += row['new_users']
            dt = row['month']
            points.append(
                {
                    'date': dt.strftime('%Y-%m-%d'),
                    'label': dt.strftime('%b %y'),
                    'total_users': cumulative,
                    'new_users': row['new_users'],
                }
            )

        return points

    async def get_seniority_breakdown(self) -> List[dict]:
        level_expr = func.coalesce(
            sa.cast(UserModel.seniority_level, sa.String),
            'unknown',
        ).label('level')
        stmt = (
            select(
                level_expr,
                func.count(UserModel.id).label('count'),
            )
            .group_by(sa.literal_column('level'))
            .order_by(sa.desc('count'))
        )

        result = await self.session.execute(stmt)
        rows = result.mappings().all()

        colors = {
            'intern': '#94a3b8',
            'junior': '#60a5fa',
            'mid_level': '#34d399',
            'senior': '#f59e0b',
            'staff': '#f97316',
            'lead': '#ef4444',
            'principal': '#a855f7',
            'specialist': '#ec4899',
            'unknown': '#6b7280',
        }

        return [
            {
                'level': str(r['level']).replace('_', ' '),
                'count': r['count'],
                'color': colors.get(str(r['level']), '#6b7280'),
            }
            for r in rows
        ]

    async def get_top_platforms(
        self, limit: int = 10
    ) -> List[dict]:
        stmt = (
            select(
                PlatformModel.name,
                func.count(ApplicationModel.id).label(
                    'total_across_users'
                ),
                func.count(
                    sa.distinct(ApplicationModel.user_id)
                ).label('unique_users'),
            )
            .join(
                ApplicationModel,
                ApplicationModel.platform_id == PlatformModel.id,
            )
            .group_by(PlatformModel.name)
            .order_by(sa.desc('total_across_users'))
            .limit(limit)
        )

        result = await self.session.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    async def get_top_companies(
        self, limit: int = 10
    ) -> List[dict]:
        stmt = (
            select(
                CompanyModel.name,
                func.count(ApplicationModel.id).label(
                    'total_across_users'
                ),
                func.count(
                    sa.distinct(ApplicationModel.user_id)
                ).label('unique_users'),
            )
            .join(
                ApplicationModel,
                ApplicationModel.company_id == CompanyModel.id,
            )
            .group_by(CompanyModel.name)
            .order_by(sa.desc('total_across_users'))
            .limit(limit)
        )

        result = await self.session.execute(stmt)
        return [dict(r) for r in result.mappings().all()]

    async def get_activity_heatmap(self) -> List[dict]:
        stmt = (
            select(
                func.extract(
                    'hour', ApplicationStepModel.created_at
                )
                .cast(sa.Integer)
                .label('hour'),
                func.extract(
                    'isodow', ApplicationStepModel.created_at
                )
                .cast(sa.Integer)
                .label('iso_dow'),
                func.count().label('count'),
            )
            .group_by(
                sa.literal_column('hour'),
                sa.literal_column('iso_dow'),
            )
        )

        result = await self.session.execute(stmt)
        rows = result.mappings().all()

        return [
            {
                'hour': r['hour'],
                'day': r['iso_dow'] - 1,  # Convert 1-7 to 0-6
                'count': r['count'],
            }
            for r in rows
        ]

    async def get_user_detail(self, user_id: int) -> dict | None:
        user = await self.session.scalar(
            select(UserModel).where(UserModel.id == user_id)
        )
        if not user:
            return None

        accepted_id = await self._get_accepted_feedback_id()

        app_counts = await self.session.execute(
            select(
                func.count(ApplicationModel.id).label('total'),
                func.count(
                    sa.case(
                        (
                            ApplicationModel.feedback_id == accepted_id,
                            1,
                        )
                    )
                ).label('offers'),
                func.count(
                    sa.case(
                        (
                            sa.and_(
                                ApplicationModel.feedback_id.isnot(None),
                                ApplicationModel.feedback_id
                                != accepted_id,
                            ),
                            1,
                        )
                    )
                ).label('denials'),
                func.count(
                    sa.case(
                        (ApplicationModel.feedback_id.is_(None), 1)
                    )
                ).label('active'),
                func.max(ApplicationModel.created_at).label(
                    'last_activity'
                ),
            ).where(ApplicationModel.user_id == user_id)
        )
        counts = app_counts.mappings().first()

        return {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'github_id': user.github_id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'current_role': user.current_role,
            'current_company': user.current_company,
            'seniority_level': (
                user.seniority_level.value
                if user.seniority_level
                else None
            ),
            'location': user.location,
            'bio': user.bio,
            'linkedin_url': user.linkedin_url,
            'tech_stack': user.tech_stack,
            'availability': (
                user.availability.value
                if user.availability
                else None
            ),
            'is_admin': user.is_admin,
            'is_org_member': user.is_org_member,
            'total_applications': counts['total'] if counts else 0,
            'offers': counts['offers'] if counts else 0,
            'denials': counts['denials'] if counts else 0,
            'active_applications': counts['active'] if counts else 0,
            'last_activity': (
                counts['last_activity'] if counts else None
            )
            or user.created_at,
            'joined_at': user.created_at,
        }

    async def get_admin_companies(
        self,
        search: str | None = None,
        is_active: bool | None = None,
        sort_by: str = 'name',
        sort_order: str = 'asc',
        page: int = 1,
        per_page: int = 25,
    ) -> tuple[list, int]:
        app_counts = (
            select(
                ApplicationModel.company_id,
                func.count(ApplicationModel.id).label(
                    'applications_count'
                ),
            )
            .where(ApplicationModel.company_id.isnot(None))
            .group_by(ApplicationModel.company_id)
            .subquery('app_counts')
        )

        stmt = (
            select(
                CompanyModel.id,
                CompanyModel.name,
                CompanyModel.url,
                CompanyModel.is_active,
                CompanyModel.created_at,
                func.coalesce(
                    app_counts.c.applications_count, 0
                ).label('applications_count'),
                UserModel.username.label('created_by_username'),
            )
            .outerjoin(
                app_counts,
                CompanyModel.id == app_counts.c.company_id,
            )
            .outerjoin(
                UserModel, CompanyModel.created_by == UserModel.id
            )
        )

        if search:
            stmt = stmt.where(
                CompanyModel.name.ilike(f'%{search}%')
            )
        if is_active is not None:
            stmt = stmt.where(CompanyModel.is_active == is_active)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt)

        sort_columns = {
            'name': CompanyModel.name,
            'created_at': CompanyModel.created_at,
            'applications_count': 'applications_count',
        }
        sort_col = sort_columns.get(sort_by, CompanyModel.name)
        if isinstance(sort_col, str):
            sort_col = sa.literal_column(sort_col)

        if sort_order == 'asc':
            stmt = stmt.order_by(sa.asc(sort_col))
        else:
            stmt = stmt.order_by(sa.desc(sort_col))

        stmt = stmt.offset((page - 1) * per_page).limit(per_page)

        result = await self.session.execute(stmt)
        rows = result.mappings().all()

        return rows, total or 0

    async def count_entity_references(
        self,
        entity_type: str,
        entity_id: int,
    ) -> int:
        """Count how many records reference the given entity."""
        if entity_type == 'platform':
            stmt = select(func.count(ApplicationModel.id)).where(
                ApplicationModel.platform_id == entity_id
            )
        elif entity_type == 'step_definition':
            stmt = select(
                func.count(ApplicationStepModel.id)
            ).where(ApplicationStepModel.step_id == entity_id)
        elif entity_type == 'feedback_definition':
            stmt = select(func.count(ApplicationModel.id)).where(
                ApplicationModel.feedback_id == entity_id
            )
        elif entity_type == 'company':
            stmt = select(func.count(ApplicationModel.id)).where(
                ApplicationModel.company_id == entity_id
            )
        else:
            return 0

        return await self.session.scalar(stmt) or 0
