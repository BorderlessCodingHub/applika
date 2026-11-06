"""Compile a stored CV document into a PDF with RenderCV and Typst.

The whole job is synchronous and CPU-bound - Jinja renders Typst markup and the
Typst compiler lays out the pages - so it runs in a worker thread through
``anyio.to_thread.run_sync`` and never blocks the event loop
(docs/adr/0011-server-side-cv-pdf-rendercv.md).

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

**The Typst compiler is driven here rather than through RenderCV.** RenderCV's
``renderer.pdf_png`` is the single module in the whole package that imports
``rendercv_fonts``, a 59 MB payload of fifteen font families the product does
not use: the ``applika`` theme typesets in Source Sans 3 and nothing else
(``themes/applika/__init__.py``). Importing that module would drag every one of
them into the API image, so this file never touches it and instead does the two
things it did that we need - build the Typst compiler and compile - against the
four Source Sans 3 faces vendored under ``fonts/`` (ADR-0011, T054). The font
family list RenderCV validates against is a literal in its schema, not a
reading of what is installed, so ``Source Sans 3`` stays a valid choice.

A consequence worth stating: the only faces on the compiler's font path are the
vendored ones. A glyph the theme asks for and Source Sans 3 does not have would
fall back to a Typst built-in and embed *that* face instead of failing, which is
why ``tests/integration/test_cv_pdf_api.py`` asserts the embedded font set
contains Source Sans 3 **and nothing else**.
"""

import atexit
import re
import shutil
import tempfile
from functools import lru_cache, partial
from pathlib import Path
from typing import NamedTuple

import anyio
import anyio.to_thread
import rendercv.renderer
import typst
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
from app.core.error_codes import ErrorCode
from app.core.exceptions import PdfRenderFailed

# The vendored theme folder, copied into every render's temp directory.
THEME_SOURCE_DIR = Path(__file__).parent / 'themes' / THEME_NAME

# The four Source Sans 3 faces the theme typesets in, plus their OFL licence.
# Deliberately *outside* THEME_SOURCE_DIR: the theme folder is copied per
# render, and 1.2 MB of fonts have no reason to be copied with it.
FONTS_DIR = Path(__file__).parent / 'fonts'

# RenderCV ships the ``rendercv`` Typst package inside its own wheel so a
# compile never reaches Typst Universe. The compiler wants it laid out as
# ``preview/<name>/<version>/``.
RENDERCV_TYPST_PACKAGE_DIR = (
    Path(rendercv.renderer.__file__).parent / 'rendercv_typst'
)
TYPST_PACKAGE_NAME = 'rendercv'
TYPST_PACKAGE_FILES = ('typst.toml', 'lib.typ')

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


def _bundled_typst_package_version() -> str:
    """The ``version`` of the ``rendercv`` Typst package inside the wheel.

    Read rather than pinned: the package path the compiler is given has to
    carry the exact version ``lib.typ`` is imported under, and a RenderCV
    upgrade that bumps it would otherwise fail every render at once.
    """
    manifest = RENDERCV_TYPST_PACKAGE_DIR / TYPST_PACKAGE_FILES[0]
    for line in manifest.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if stripped.startswith('version'):
            return stripped.split('=', 1)[1].strip().strip('"')
    raise RuntimeError('No version in the bundled Typst package manifest')


@lru_cache(maxsize=1)
def typst_package_path() -> Path:
    """Lay RenderCV's bundled Typst package out the way the compiler wants.

    The compiler resolves ``@preview/rendercv:<version>`` by looking for
    ``<package_path>/preview/rendercv/<version>/``, so the two bundled files
    are copied into a throwaway directory with that shape. Built once per
    process - it depends on nothing but the installed wheel - and removed at
    interpreter exit.
    """
    package_root = Path(tempfile.mkdtemp(prefix='applika-typst-pkg-'))
    atexit.register(shutil.rmtree, str(package_root), True)

    version_dir = (
        package_root
        / 'preview'
        / TYPST_PACKAGE_NAME
        / _bundled_typst_package_version()
    )
    version_dir.mkdir(parents=True)
    for name in TYPST_PACKAGE_FILES:
        shutil.copy2(RENDERCV_TYPST_PACKAGE_DIR / name, version_dir / name)
    return package_root


def _compile_pdf(typst_path: Path) -> bytes:
    """Compile the generated Typst source, with only the vendored fonts.

    ``font_paths`` holds ``fonts/`` and nothing else, so the PDF can only
    embed a face the product ships and has a licence for.

    ``ignore_system_fonts`` is the other half of that, and it is not
    belt-and-braces: without it the compiler also reads whatever is installed
    on the host, so a developer's machine and the API image - which has no
    system fonts at all - would silently produce different PDFs from the same
    row. Sealing it makes the output a function of the vendored files alone.
    """
    pdf_path = typst_path.with_suffix('.pdf')
    compiler = typst.Compiler(
        root=typst_path.parent,
        font_paths=[FONTS_DIR],
        ignore_system_fonts=True,
        package_path=typst_package_path(),
    )
    compiler.compile(input=typst_path, format='pdf', output=pdf_path)
    return pdf_path.read_bytes()


def generate_typst_source(yaml_text: str, work_dir: Path) -> Path:
    """Run the theme through Jinja and return the generated ``.typ`` file.

    Copying the theme is the first step for a reason: RenderCV needs it on
    disk beside ``cv.yaml`` before it validates the ``design`` block.
    ``__pycache__`` is skipped so a stale compiled module cannot travel with
    it.

    Split out of :func:`_render_sync` because this - not the PDF - is where
    the theme's markup can be inspected. Typst prints unbalanced ``[``, ``]``
    and ``)`` as ordinary text instead of failing, so a compile that succeeds
    proves nothing about the markup; the generated source does.
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
    typst_path = generate_typst(model)
    if typst_path is None:
        raise RuntimeError('RenderCV produced no Typst source')
    return Path(typst_path)


def _render_sync(yaml_text: str, work_dir: Path) -> bytes:
    """Do the actual compile. Runs in a worker thread, never on the loop."""
    return _compile_pdf(generate_typst_source(yaml_text, work_dir))


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
            raise PdfRenderFailed(
                RENDER_FAILED_MESSAGE, ErrorCode.CV_PDF_RENDER_FAILED
            ) from exc
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
            raise PdfRenderFailed(
                RENDER_FAILED_MESSAGE, ErrorCode.CV_PDF_RENDER_FAILED
            ) from exc
        finally:
            # ``abandon_on_cancel`` means a timed-out compile may still be
            # writing in here, so a failure to delete must not mask the error.
            shutil.rmtree(work_dir, ignore_errors=True)

        return RenderedPdf(content=content, filename=pdf_filename(cv.name))


def get_cv_pdf_renderer() -> CVPdfRenderer:
    """Factory used by the DI layer."""
    return CVPdfRenderer()
