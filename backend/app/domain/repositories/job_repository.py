from __future__ import annotations

from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.models import (
    JobFitSnapshotModel,
    JobModel,
    JobSourceModel,
    JobTagModel,
)


class JobRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert(
        self, source_id: int, external_id: str, job_data: dict
    ) -> tuple[JobModel, bool]:
        try:
            existing = await self.session.scalar(
                select(JobModel).where(
                    JobModel.source_id == source_id,
                    JobModel.external_id == external_id,
                )
            )
            if existing is not None:
                new_hash = job_data.get('content_hash')
                if new_hash and existing.content_hash == new_hash:
                    return existing, False
                for key, val in job_data.items():
                    setattr(existing, key, val)
                self.session.add(existing)
                await self.session.commit()
                await self.session.refresh(existing)
                return existing, False

            job = JobModel(
                source_id=source_id, external_id=external_id, **job_data
            )
            self.session.add(job)
            await self.session.commit()
            await self.session.refresh(job)
            return job, True
        except Exception as e:
            await self.session.rollback()
            raise e

    async def replace_tags(self, job_id: int, tags: list[str]) -> None:
        try:
            await self.session.execute(
                sa.delete(JobTagModel).where(JobTagModel.job_id == job_id)
            )
            for tag in tags:
                self.session.add(JobTagModel(job_id=job_id, tag=tag))
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def list_jobs(
        self,
        user_id: int | None = None,
        resume_id: int | None = None,
        source: str | None = None,
        search: str | None = None,
        min_fit: int | None = None,
        posted_after: datetime | None = None,
        sort: str = 'newest',
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        params: dict[str, Any] = {
            'is_active': True,
            'limit': page_size,
            'offset': (page - 1) * page_size,
        }

        fit_join = ''
        fit_cols = (
            ', NULL::int AS fit_score'
            ', NULL::text AS matched_keywords_json'
            ', NULL::text AS missing_keywords_json'
        )
        if user_id is not None and resume_id is not None:
            fit_cols = (
                ', fs.fit_score'
                ', fs.matched_keywords_json'
                ', fs.missing_keywords_json'
            )
            fit_join = (
                ' LEFT JOIN job_fit_snapshots fs'
                ' ON fs.job_id = j.id'
                ' AND fs.user_id = :fit_user_id'
                ' AND fs.resume_id = :fit_resume_id'
            )
            params['fit_user_id'] = user_id
            params['fit_resume_id'] = resume_id

        where_parts = ['j.is_active = :is_active']

        if source is not None:
            where_parts.append('js.code = :source')
            params['source'] = source

        if search is not None:
            where_parts.append(
                '(j.title ILIKE :search OR j.company_name ILIKE :search)'
            )
            params['search'] = f'%{search}%'

        if posted_after is not None:
            where_parts.append('j.posted_at >= :posted_after')
            params['posted_after'] = posted_after

        if min_fit is not None and fit_join:
            where_parts.append('fs.fit_score >= :min_fit')
            params['min_fit'] = min_fit

        where_clause = ' AND '.join(where_parts)

        if sort == 'oldest':
            order_clause = 'j.posted_at ASC NULLS FIRST'
        elif sort == 'best_fit' and fit_join:
            order_clause = (
                'fs.fit_score DESC NULLS LAST, j.posted_at DESC NULLS LAST'
            )
        else:
            order_clause = 'j.posted_at DESC NULLS LAST'

        base_sql = (
            'SELECT j.id, j.source_id, js.code AS source_code,'
            ' j.title, j.company_name, j.location_text, j.job_url,'
            ' j.employment_type, j.salary_text, j.posted_at'
            f'{fit_cols}'
            ' FROM jobs j'
            ' JOIN job_sources js ON js.id = j.source_id'
            f'{fit_join}'
            f' WHERE {where_clause}'
            f' ORDER BY {order_clause}'
            ' LIMIT :limit OFFSET :offset'
        )

        count_sql = (
            'SELECT COUNT(*) FROM jobs j'
            ' JOIN job_sources js ON js.id = j.source_id'
            f'{fit_join}'
            f' WHERE {where_clause}'
        )

        rows_result = await self.session.execute(
            text(base_sql), params
        )
        count_result = await self.session.execute(
            text(count_sql),
            {k: v for k, v in params.items() if k not in ('limit', 'offset')},
        )
        total = count_result.scalar() or 0
        rows = [dict(row._mapping) for row in rows_result]

        # Attach tags for each job
        if rows:
            job_ids = [r['id'] for r in rows]
            tags_result = await self.session.execute(
                select(JobTagModel).where(JobTagModel.job_id.in_(job_ids))
            )
            tag_map: dict[int, list[str]] = {}
            for tag_row in tags_result.scalars():
                tag_map.setdefault(tag_row.job_id, []).append(tag_row.tag)
            for row in rows:
                row['tags'] = tag_map.get(row['id'], [])

        return rows, total

    async def get_by_id(self, job_id: int) -> JobModel | None:
        return await self.session.scalar(
            select(JobModel)
            .where(JobModel.id == job_id)
            .options(
                selectinload(JobModel.source),
                selectinload(JobModel.tags),
            )
        )

    async def get_all_active_ids(self) -> list[int]:
        result = await self.session.scalars(
            select(JobModel.id).where(JobModel.is_active == sa.true())
        )
        return list(result)
