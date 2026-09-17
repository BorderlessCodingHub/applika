"""Application CV copy repository.

The constructor takes an ``AsyncSession`` and the repository owns its own
commit/rollback. Methods return ORM models (``TailoredCVModel``), never DTOs.

Every read and every write is scoped to the owning user
(docs/applika/adr/0004-row-ownership-and-is-admin.md). That scoping is a
second line of defence, not the first: nothing in the schema ties
``tailored_cvs.user_id`` to ``applications.user_id``, so the use cases
authorize against the *application's* owner before they ever call in here.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.tailored_cv import (
    TailoredCVUpdateDTO,
    TailoringResult,
)
from app.domain.models import TailoredCVModel


class TailoredCVRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_application_id_and_user_id(
        self, application_id: int, user_id: int
    ) -> TailoredCVModel | None:
        """Fetch the CV copy of one application owned by ``user_id``.

        Returns ``None`` when the application has no copy *or* the copy
        belongs to another user; the caller maps both to ``ResourceNotFound``.
        """
        return await self.session.scalar(
            select(TailoredCVModel).where(
                TailoredCVModel.application_id == application_id,
                TailoredCVModel.user_id == user_id,
            )
        )

    async def create(
        self,
        user_id: int,
        application_id: int,
        base_cv_id: int,
        result: TailoringResult,
    ) -> TailoredCVModel:
        """Insert the CV copy produced by the tailoring port.

        The content arrives already tailored, so this method only persists it.
        Section items are stored as plain JSON, preserving the
        client-generated sub-item ids that came from the master CV.
        """
        content = result.content
        try:
            tailored_cv = TailoredCVModel(
                user_id=user_id,
                application_id=application_id,
                base_cv_id=base_cv_id,
                name=content.name,
                full_name=content.full_name,
                headline=content.headline,
                location=content.location,
                email=content.email,
                phone=content.phone,
                summary=content.summary,
                links=[item.model_dump() for item in content.links],
                skills=[item.model_dump() for item in content.skills],
                experience=[item.model_dump() for item in content.experience],
                projects=[item.model_dump() for item in content.projects],
                education=[item.model_dump() for item in content.education],
                certifications=[
                    item.model_dump() for item in content.certifications
                ],
                languages=[item.model_dump() for item in content.languages],
                was_ai_generated=result.was_ai_generated,
                adjustments=[item.model_dump() for item in result.adjustments],
            )
            self.session.add(tailored_cv)
            await self.session.commit()
            await self.session.refresh(tailored_cv)
            return tailored_cv
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, tailored_cv: TailoredCVModel, data: TailoredCVUpdateDTO
    ) -> TailoredCVModel:
        """Replace the whole editable body of an owned CV copy (PUT).

        Provenance is untouched: a manual edit never changes ``base_cv_id``,
        ``was_ai_generated`` or ``adjustments``.
        """
        try:
            tailored_cv.name = data.name
            tailored_cv.full_name = data.full_name
            tailored_cv.headline = data.headline
            tailored_cv.location = data.location
            tailored_cv.email = data.email
            tailored_cv.phone = data.phone
            tailored_cv.summary = data.summary
            tailored_cv.links = [item.model_dump() for item in data.links]
            tailored_cv.skills = [item.model_dump() for item in data.skills]
            tailored_cv.experience = [
                item.model_dump() for item in data.experience
            ]
            tailored_cv.projects = [item.model_dump() for item in data.projects]
            tailored_cv.education = [
                item.model_dump() for item in data.education
            ]
            tailored_cv.certifications = [
                item.model_dump() for item in data.certifications
            ]
            tailored_cv.languages = [
                item.model_dump() for item in data.languages
            ]
            self.session.add(tailored_cv)
            await self.session.commit()
            await self.session.refresh(tailored_cv)
            return tailored_cv
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, tailored_cv: TailoredCVModel) -> None:
        """Delete an owned CV copy, freeing the application for a new one."""
        try:
            await self.session.delete(tailored_cv)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
