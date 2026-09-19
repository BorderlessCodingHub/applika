"""Render-master-CV-to-Markdown use case (KODI-017, T090)."""

import time

from app.application.dto.base_cv import BaseCVDTO
from app.application.services.cv_rendering.markdown_renderer import (
    CVMarkdownRenderer,
    RenderedMarkdown,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.base_cv_repository import BaseCVRepository


class RenderBaseCVMarkdownUseCase:
    """Render one of the acting user's own master CVs as Markdown.

    Same ownership and 404 semantics as :class:`RenderBaseCVPdfUseCase`: a
    master CV that does not exist *or* belongs to another user is a 404
    (ADR-0004), admin or not. Rendering is a read.
    """

    def __init__(
        self, base_cv_repo: BaseCVRepository, renderer: CVMarkdownRenderer
    ):
        self.base_cv_repo = base_cv_repo
        self.renderer = renderer

    async def execute(self, base_cv_id: int, user_id: int) -> RenderedMarkdown:
        base_cv = await self.base_cv_repo.get_by_id_and_user_id(
            base_cv_id, user_id
        )
        if not base_cv:
            raise ResourceNotFound('Base CV not found')

        started_at = time.perf_counter()
        rendered = await self.renderer.render(BaseCVDTO.model_validate(base_cv))
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)

        logger.info(
            'CV Markdown rendered',
            extra={
                'extra_data': {
                    'event': 'cv.markdown.rendered',
                    'document': 'base_cv',
                    'base_cv_id': base_cv_id,
                    'user_id': user_id,
                    'bytes': len(rendered.content),
                    'duration_ms': elapsed_ms,
                }
            },
        )
        return rendered
