from datetime import UTC, date, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.application.dto.application import ApplicationCreateDTO
from app.application.dto.application_draft import DraftInputDTO
from app.domain.models import ApplicationModel
from app.domain.repositories.application_filters import NOT_DRAFT


class ApplicationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id_and_user_id(
        self, id: int, user_id: int, include_drafts: bool = False
    ) -> ApplicationModel | None:
        """The one caller that needs a draft too
        (``tailored_cvs/guards.load_owned_application``) passes
        ``include_drafts=True`` so the CV-copy routes work on a draft; every
        other caller keeps the default, which never returns a draft
        (ADR-0014, KODI-032)."""
        stmt = select(ApplicationModel).where(
            ApplicationModel.id == id, ApplicationModel.user_id == user_id
        )
        if not include_drafts:
            stmt = stmt.where(NOT_DRAFT)
        return await self.session.scalar(
            stmt.options(selectinload(ApplicationModel.company_rel))
        )

    async def get_all_by_user_id(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[ApplicationModel]:
        stmt = (
            select(ApplicationModel)
            .where(ApplicationModel.user_id == user_id, NOT_DRAFT)
            .order_by(ApplicationModel.application_date.desc())
            .options(selectinload(ApplicationModel.company_rel))
        )
        if cycle_id is not None:
            stmt = stmt.where(ApplicationModel.cycle_id == cycle_id)
        else:
            stmt = stmt.where(ApplicationModel.cycle_id.is_(None))
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def create(
        self,
        application: ApplicationCreateDTO,
        company_id: int | None,
        company_name: str,
    ) -> ApplicationModel:
        try:
            db_application = ApplicationModel(
                **application.model_dump(exclude={'link_to_job', 'company'}),
                link_to_job=(
                    str(application.link_to_job)
                    if application.link_to_job
                    else None
                ),
                company_id=company_id,
                company_name=company_name,
            )
            self.session.add(db_application)
            await self.session.commit()
            await self.session.refresh(db_application)
            return db_application
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(self, application: ApplicationModel) -> ApplicationModel:
        try:
            application.updated_at = datetime.now(UTC)
            self.session.add(application)
            await self.session.commit()
            return application
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete_by_id(self, id: int) -> int:
        result = await self.session.execute(
            delete(ApplicationModel).where(ApplicationModel.id == id)
        )
        await self.session.commit()
        return int(getattr(result, 'rowcount', 0) or 0)

    # --- Drafts (KODI-032, ADR-0014) -------------------------------------

    async def create_draft(
        self,
        data: DraftInputDTO,
        company_id: int | None,
        company_name: str,
    ) -> ApplicationModel:
        """A draft's ``application_date`` is a server-today placeholder -
        it is never asked from the user and is overwritten by
        ``finish_draft`` with the caller's own date."""
        try:
            db_application = ApplicationModel(
                **data.model_dump(
                    exclude={
                        'user_id',
                        'company_id',
                        'company_name',
                        'link_to_job',
                    }
                ),
                user_id=data.user_id,
                company_id=company_id,
                company_name=company_name,
                link_to_job=(
                    str(data.link_to_job) if data.link_to_job else None
                ),
                application_date=date.today(),
                is_draft=True,
                cycle_id=None,
            )
            self.session.add(db_application)
            await self.session.commit()
            await self.session.refresh(db_application)
            return db_application
        except Exception as e:
            await self.session.rollback()
            raise e

    async def get_draft(self, id: int, user_id: int) -> ApplicationModel | None:
        """The caller's own draft, its CV copy eager-loaded so ``has_cv``
        never costs an extra query."""
        return await self.session.scalar(
            select(ApplicationModel)
            .where(
                ApplicationModel.id == id,
                ApplicationModel.user_id == user_id,
                ApplicationModel.is_draft.is_(True),
            )
            .options(
                selectinload(ApplicationModel.company_rel),
                selectinload(ApplicationModel.tailored_cv),
            )
        )

    async def list_drafts(self, user_id: int) -> list[ApplicationModel]:
        """The caller's own drafts, most recently saved first.

        ``updated_at`` is NULL until a draft's first update
        (``BaseMixin``, ``onupdate=func.now()``, no creation-time default),
        and Postgres sorts NULLs *first* in a plain ``DESC`` order - a
        freshly created, never-touched draft would wrongly outrank one
        edited a minute ago. ``COALESCE(updated_at, created_at)`` is "last
        saved" the way the drafts list means it (#9)."""
        last_saved = func.coalesce(
            ApplicationModel.updated_at, ApplicationModel.created_at
        )
        return list(
            await self.session.scalars(
                select(ApplicationModel)
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.is_draft.is_(True),
                )
                .order_by(last_saved.desc())
                .options(selectinload(ApplicationModel.tailored_cv))
            )
        )
