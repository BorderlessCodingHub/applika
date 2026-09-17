"""Compile a stored CV document into a PDF with RenderCV and Typst.

The whole job is synchronous and CPU-bound - Jinja renders Typst markup and the
Typst compiler lays out the pages - so it runs in a worker thread through
``anyio.to_thread.run_sync`` and never blocks the event loop
(docs/applika/adr/0011-server-side-cv-pdf-rendercv.md).

Everything happens in a throwaway directory that is removed in ``finally``,
success or failure. That directory is not an implementation detail we could
skip: RenderCV resolves a custom theme by looking for a folder named exactly
the theme name **next to the input YAML file**, so each render gets its own
directory holding a copy of ``themes/applika/`` and a freshly written
``cv.yaml``. Two concurrent renders therefore never share a byte.

Nothing is persisted and no row changes. A render that fails - bad input
RenderCV refuses, a Typst compile error, or a compile that runs past
``CV_PDF_RENDER_TIMEOUT_SECONDS`` - raises :class:`PdfRenderFailed`, which the
API turns into a 500 with a fixed message. The message is fixed on purpose:
RenderCV's own errors quote the offending field value, and CV content has no
business in an HTTP body or in the logs.
"""

import re
import shutil
import tempfile
from functools import partial
from pathlib import Path
from typing import NamedTuple

import anyio
import anyio.to_thread
from rendercv.renderer.pdf_png import generate_pdf
from rendercv.renderer.typst import generate_typst
from rendercv.schema.rendercv_model_builder import (
    build_rendercv_dictionary_and_model,
)

from app.application.services.cv_rendering.mapper import (
    THEME_NAME,
    RenderableCV,
    map_cv_to_rendercv_yaml,
)
from app.config.logging import logger
from app.config.settings import envs
from app.core.exceptions import PdfRenderFailed

# The vendored theme folder, copied into every render's temp directory.
THEME_SOURCE_DIR = Path(__file__).parent / 'themes' / THEME_NAME

INPUT_FILE_NAME = 'cv.yaml'
OUTPUT_DIR_NAME = 'out'

RENDER_FAILED_MESSAGE = 'Could not render the CV PDF'

_SLUG_SEPARATOR = '-'
_NON_SLUG_CHARS = re.compile(r'[^a-z0-9]+')
_FALLBACK_SLUG = 'cv'


class RenderedPdf(NamedTuple):
    """A finished PDF plus the name the browser should save it under."""

    content: bytes
    filename: str


def slugify(name: str) -> str:
    """Turn a CV label into the download filename stem.

    Lowercased, every run of characters outside ``[a-z0-9]`` collapsed to a
    single ``-``, no leading or trailing ``-``. A label that leaves nothing
    behind - punctuation only, or a script with no ASCII letters - falls back
    to ``cv`` rather than producing an empty filename.
    """
    slug = _NON_SLUG_CHARS.sub(_SLUG_SEPARATOR, (name or '').lower())
    slug = slug.strip(_SLUG_SEPARATOR)
    return slug or _FALLBACK_SLUG


def pdf_filename(name: str) -> str:
    """The ``filename=`` value of the ``Content-Disposition`` header."""
    return f'{slugify(name)}.pdf'


def _render_sync(yaml_text: str, work_dir: Path) -> bytes:
    """Do the actual compile. Runs in a worker thread, never on the loop.

    Copying the theme is the first step for a reason: RenderCV needs it on
    disk beside ``cv.yaml`` before it validates the ``design`` block.
    ``__pycache__`` is skipped so a stale compiled module cannot travel with
    it.
    """
    shutil.copytree(
        THEME_SOURCE_DIR,
        work_dir / THEME_NAME,
        ignore=shutil.ignore_patterns('__pycache__'),
    )

    input_file_path = work_dir / INPUT_FILE_NAME
    input_file_path.write_text(yaml_text, encoding='utf-8')

    _document, model = build_rendercv_dictionary_and_model(
        yaml_text,
        input_file_path=input_file_path,
        output_folder=work_dir / OUTPUT_DIR_NAME,
        dont_generate_html=True,
        dont_generate_markdown=True,
        dont_generate_png=True,
    )
    pdf_path = generate_pdf(model, generate_typst(model))
    if pdf_path is None:
        raise RuntimeError('RenderCV produced no PDF')
    return Path(pdf_path).read_bytes()


class CVPdfRenderer:
    """Renders a stored CV document into PDF bytes with the fixed theme.

    One implementation, one theme, no options: there is deliberately no way
    for a caller to ask for a different look.
    """

    def __init__(self, timeout_seconds: int | None = None):
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else envs.CV_PDF_RENDER_TIMEOUT_SECONDS
        )

    async def render(self, cv: RenderableCV) -> RenderedPdf:
        """Compile ``cv`` and return its bytes and download filename.

        Raises:
            PdfRenderFailed: the compile failed or ran past the timeout.
        """
        yaml_text = map_cv_to_rendercv_yaml(cv)
        work_dir = Path(tempfile.mkdtemp(prefix='applika-cv-pdf-'))
        try:
            with anyio.fail_after(self.timeout_seconds):
                content = await anyio.to_thread.run_sync(
                    partial(_render_sync, yaml_text, work_dir),
                    abandon_on_cancel=True,
                )
        except TimeoutError as exc:
            logger.warning(
                'CV PDF render timed out',
                extra={
                    'extra_data': {
                        'event': 'cv.pdf.render_timeout',
                        'timeout_seconds': self.timeout_seconds,
                    }
                },
            )
            raise PdfRenderFailed(RENDER_FAILED_MESSAGE) from exc
        except Exception as exc:
            # Only the exception's *type* is logged: RenderCV's messages quote
            # the CV field that upset it, and that is the user's own data.
            logger.error(
                'CV PDF render failed',
                extra={
                    'extra_data': {
                        'event': 'cv.pdf.render_failed',
                        'error_type': type(exc).__name__,
                    }
                },
            )
            raise PdfRenderFailed(RENDER_FAILED_MESSAGE) from exc
        finally:
            # ``abandon_on_cancel`` means a timed-out compile may still be
            # writing in here, so a failure to delete must not mask the error.
            shutil.rmtree(work_dir, ignore_errors=True)

        return RenderedPdf(content=content, filename=pdf_filename(cv.name))


def get_cv_pdf_renderer() -> CVPdfRenderer:
    """Factory used by the DI layer."""
    return CVPdfRenderer()
