"""Render-application-CV-copy-to-PDF use case."""

import time

from app.application.dto.tailored_cv import TailoredCVDTO
from app.application.services.cv_rendering.renderer import (
    CVPdfRenderer,
    RenderedPdf,
)
from app.application.use_cases.tailored_cvs.guards import (
    load_owned_application,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)


class RenderTailoredCVPdfUseCase:
    """Typeset the CV copy of one of the acting user's own applications.

    Deliberately **not** guarded by ``ensure_application_is_editable``, exactly
    like ``GetTailoredCVUseCase``: downloading the PDF of a finalized or
    archived application's copy is the point - a user has to be able to take
    away the CV they actually sent. Only writing is refused, and that refusal
    lives untouched in ``guards.ensure_application_is_editable``.

    Ownership is still checked, and against the application's owner first:
    another user's application is a 404, and so is an application that simply
    has no copy yet.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        application_repo: ApplicationRepository,
        renderer: CVPdfRenderer,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.application_repo = application_repo
        self.renderer = renderer

    async def execute(self, application_id: int, user_id: int) -> RenderedPdf:
        await load_owned_application(
            self.application_repo, application_id, user_id
        )
        tailored_cv = (
            await self.tailored_cv_repo.get_by_application_id_and_user_id(
                application_id, user_id
            )
        )
        if not tailored_cv:
            raise ResourceNotFound('CV copy not found')

        started_at = time.perf_counter()
        rendered = await self.renderer.render(
            TailoredCVDTO.model_validate(tailored_cv)
        )
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)

        # Identifiers, size and duration only - never a byte of the CV itself.
        logger.info(
            'CV PDF rendered',
            extra={
                'extra_data': {
                    'event': 'cv.pdf.rendered',
                    'document': 'tailored_cv',
                    'application_id': application_id,
                    'tailored_cv_id': tailored_cv.id,
                    'user_id': user_id,
                    'bytes': len(rendered.content),
                    'duration_ms': elapsed_ms,
                }
            },
        )
        return rendered
