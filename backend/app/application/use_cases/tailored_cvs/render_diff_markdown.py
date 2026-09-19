"""Render the diff between an application's CV copy and its baseline as Markdown.

KODI-017 T091. Filename: ``"<pdf slug>-changes.md"`` (PINNED).
"""

from dataclasses import dataclass

from app.application.services.cv_diff_markdown import render_diff_markdown
from app.application.services.cv_rendering.renderer import slugify
from app.application.use_cases.tailored_cvs.diff import (
    ComputeTailoredCVDiffUseCase,
)


@dataclass
class RenderedDiffMarkdown:
    content: str
    filename: str


class RenderTailoredCVDiffMarkdownUseCase:
    def __init__(self, compute_diff: ComputeTailoredCVDiffUseCase):
        self.compute_diff = compute_diff

    async def execute(
        self, application_id: int, user_id: int
    ) -> RenderedDiffMarkdown:
        outcome = await self.compute_diff.execute(application_id, user_id)
        content = render_diff_markdown(
            outcome.tailored_cv.name,
            outcome.baseline_label,
            outcome.diff,
            outcome.current,
        )
        filename = f'{slugify(outcome.tailored_cv.name)}-changes.md'
        return RenderedDiffMarkdown(content=content, filename=filename)
