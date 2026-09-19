"""Render the diff between an application's CV copy and its baseline as a PDF.

KODI-017 T091. Same content as :mod:`render_diff_markdown`, compiled through
Typst (:mod:`app.application.services.cv_rendering.diff_pdf_renderer`).
"""

from app.application.services.cv_diff_markdown import render_diff_markdown
from app.application.services.cv_rendering.diff_pdf_renderer import (
    CVDiffPdfRenderer,
    RenderedDiffPdf,
)
from app.application.services.cv_rendering.renderer import slugify
from app.application.use_cases.tailored_cvs.diff import (
    ComputeTailoredCVDiffUseCase,
)


class RenderTailoredCVDiffPdfUseCase:
    def __init__(
        self,
        compute_diff: ComputeTailoredCVDiffUseCase,
        renderer: CVDiffPdfRenderer,
    ):
        self.compute_diff = compute_diff
        self.renderer = renderer

    async def execute(
        self, application_id: int, user_id: int
    ) -> RenderedDiffPdf:
        outcome = await self.compute_diff.execute(application_id, user_id)
        markdown_content = render_diff_markdown(
            outcome.tailored_cv.name,
            outcome.baseline_label,
            outcome.diff,
            outcome.current,
        )
        return await self.renderer.render(
            markdown_content, slugify(outcome.tailored_cv.name)
        )
