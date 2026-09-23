"""Compile a CV diff's Markdown document into a PDF, with Typst (KODI-017, T091).

Sibling of :mod:`app.application.services.cv_rendering.renderer`, much
smaller: the diff PDF is not a typeset CV, it is "the same content as the
Markdown" (T091, "Diff PDF") wrapped in a minimal Typst template
(``diff_template/diff.typ``) that prints it verbatim through ``#raw`` -
see that file for why the content is passed through Typst's ``sys.inputs``
instead of interpolated into the source (no escaping needed for free-text CV
content that may itself contain Typst markup characters).

The same discipline as the PDF/Markdown renderers applies: everything happens
in a throwaway output directory removed in ``finally``, a compile is bounded
by ``CV_PDF_RENDER_TIMEOUT_SECONDS`` and runs in a worker thread
(``anyio.to_thread.run_sync``), and a failure logs only the exception type,
never a byte of CV content, before raising the fixed-message
:class:`CVExportFailed`.

Only the vendored Source Sans 3 faces are on the compiler's font path
(``renderer.FONTS_DIR``, ``ignore_system_fonts=True``), same as the CV PDF -
see that module's docstring for why a missing glyph silently embeds a Typst
built-in face instead of failing, and why that is an accepted, tested
trade-off rather than an oversight.
"""

import shutil
import tempfile
from functools import partial
from pathlib import Path
from typing import NamedTuple

import anyio
import anyio.to_thread
import typst

from app.application.services.cv_rendering.renderer import FONTS_DIR
from app.config.logging import logger
from app.config.settings import envs
from app.core.exceptions import CVExportFailed

DIFF_TEMPLATE_PATH = Path(__file__).parent / 'diff_template' / 'diff.typ'

RENDER_FAILED_MESSAGE = 'Could not render the CV diff PDF'


class RenderedDiffPdf(NamedTuple):
    content: bytes
    filename: str


def diff_pdf_filename(slug: str) -> str:
    """The ``filename=`` value: ``"<pdf slug>-changes.pdf"`` (T091, PINNED)."""
    return f'{slug}-changes.pdf'


def _compile_sync(markdown_content: str, work_dir: Path) -> bytes:
    output_path = work_dir / 'diff.pdf'
    compiler = typst.Compiler(
        root=DIFF_TEMPLATE_PATH.parent,
        font_paths=[FONTS_DIR],
        ignore_system_fonts=True,
    )
    compiler.compile(
        input=DIFF_TEMPLATE_PATH,
        format='pdf',
        output=output_path,
        sys_inputs={'content': markdown_content},
    )
    return output_path.read_bytes()


class CVDiffPdfRenderer:
    """Compiles a diff Markdown document into PDF bytes, no options."""

    def __init__(self, timeout_seconds: int | None = None):
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else envs.CV_PDF_RENDER_TIMEOUT_SECONDS
        )

    async def render(self, markdown_content: str, slug: str) -> RenderedDiffPdf:
        """Compile ``markdown_content`` and return its PDF bytes and filename.

        Raises:
            CVExportFailed: the compile failed or ran past the timeout.
        """
        work_dir = Path(tempfile.mkdtemp(prefix='applika-cv-diff-pdf-'))
        try:
            with anyio.fail_after(self.timeout_seconds):
                content = await anyio.to_thread.run_sync(
                    partial(_compile_sync, markdown_content, work_dir),
                    abandon_on_cancel=True,
                )
        except TimeoutError as exc:
            logger.warning(
                'CV diff PDF render timed out',
                extra={
                    'extra_data': {
                        'event': 'cv.diff_pdf.render_timeout',
                        'timeout_seconds': self.timeout_seconds,
                    }
                },
            )
            raise CVExportFailed(RENDER_FAILED_MESSAGE) from exc
        except Exception as exc:
            logger.error(
                'CV diff PDF render failed',
                extra={
                    'extra_data': {
                        'event': 'cv.diff_pdf.render_failed',
                        'error_type': type(exc).__name__,
                    }
                },
            )
            raise CVExportFailed(RENDER_FAILED_MESSAGE) from exc
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

        return RenderedDiffPdf(
            content=content, filename=diff_pdf_filename(slug)
        )


def get_cv_diff_pdf_renderer() -> CVDiffPdfRenderer:
    """Factory used by the DI layer."""
    return CVDiffPdfRenderer()
