"""Render-master-CV-to-PDF use case."""

import time

from app.application.dto.base_cv import BaseCVDTO
from app.application.services.cv_rendering.renderer import (
    CVPdfRenderer,
    RenderedPdf,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.base_cv_repository import BaseCVRepository


class RenderBaseCVPdfUseCase:
    """Typeset one of the acting user's own master CVs as a PDF.

    Ownership is the only gate, and it is the same one ``GetBaseCVUseCase``
    applies: a master CV that does not exist *or* belongs to another user is a
    404 (ADR-0004), admin or not. Rendering is a read - it writes no row, and
    the document it returns is a pure function of the row it read.
    """

    def __init__(self, base_cv_repo: BaseCVRepository, renderer: CVPdfRenderer):
        self.base_cv_repo = base_cv_repo
        self.renderer = renderer

    async def execute(self, base_cv_id: int, user_id: int) -> RenderedPdf:
        base_cv = await self.base_cv_repo.get_by_id_and_user_id(
            base_cv_id, user_id
        )
        if not base_cv:
            raise ResourceNotFound('Base CV not found')

        started_at = time.perf_counter()
        rendered = await self.renderer.render(BaseCVDTO.model_validate(base_cv))
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)

        # Identifiers, size and duration only - never a byte of the CV itself.
        logger.info(
            'CV PDF rendered',
            extra={
                'extra_data': {
                    'event': 'cv.pdf.rendered',
                    'document': 'base_cv',
                    'base_cv_id': base_cv_id,
                    'user_id': user_id,
                    'bytes': len(rendered.content),
                    'duration_ms': elapsed_ms,
                }
            },
        )
        return rendered
