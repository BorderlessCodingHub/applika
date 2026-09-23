"""Render-application-CV-copy-to-Markdown use case (KODI-017, T090)."""

import time

from app.application.dto.tailored_cv import TailoredCVDTO
from app.application.services.cv_rendering.markdown_renderer import (
    CVMarkdownRenderer,
    RenderedMarkdown,
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


class RenderTailoredCVMarkdownUseCase:
    """Render the CV copy of one of the acting user's own applications.

    Same shape as :class:`RenderTailoredCVPdfUseCase`: no
    ``ensure_application_is_editable`` guard - downloading the Markdown of a
    finalized or archived application's copy is exactly the point, matching
    ``GET`` and the PDF download. Ownership is checked against the
    application's owner first, same as every other CV-copy route.
    """

    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        application_repo: ApplicationRepository,
        renderer: CVMarkdownRenderer,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.application_repo = application_repo
        self.renderer = renderer

    async def execute(
        self, application_id: int, user_id: int
    ) -> RenderedMarkdown:
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

        logger.info(
            'CV Markdown rendered',
            extra={
                'extra_data': {
                    'event': 'cv.markdown.rendered',
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
