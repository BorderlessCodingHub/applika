"""Render a stored CV document into Markdown with RenderCV's own template.

Same job as :mod:`app.application.services.cv_rendering.renderer`, minus the
Typst compile: the SAME ``RenderCVModel`` the PDF path builds - same mapper,
same vendored ``applika`` theme, same ``SECTION_ORDER`` - is fed to RenderCV
2.8's own Markdown templater
(``rendercv.renderer.templater.templater.render_full_template(model,
"markdown")``), in memory, with the throwaway directory removed in
``finally`` exactly like the PDF path (KODI-017, T090).

**One override, and why it exists.** RenderCV computes a per-format
``cv._connections`` list that already includes every header contact - email,
phone, location, social networks *and* ``custom_connections`` (a link that is
not a known social network, e.g. a personal site: see
``mapper._as_social_network``) - and the **Typst** ``Header.j2.typ`` template
uses it. RenderCV's own **Markdown** ``Header.j2.md`` template does not: it
reads ``cv.phone``, ``cv.email``, ``cv.location``, ``cv.website`` and
``cv.social_networks`` directly and never looks at ``cv._connections``, so any
``custom_connections`` entry - a link that does not match a known social
network - is silently absent from the Markdown header while the same link is
present in the PDF. Confirmed empirically: a CV with a GitHub link (a known
social network) and a personal-site link (not one) renders the personal site
in the PDF and drops it from RenderCV's stock Markdown output.

That is real content loss between the two downloads of the same document, not
a cosmetic difference, so this file ships ``markdown_overrides/Header.j2.md``,
a one-file override that lists ``cv._connections`` instead, and prints
``cv.headline`` under the name as the applika Typst header does (the stock
Markdown header omits the headline too).

The mapper's Typst escape for ``#word`` (``mapper.TYPST_ESCAPED_HASH``) is
turned back into a literal ``#`` after rendering, so a summary saying
``#opentowork`` reads the same in the Markdown as in the PDF. It is not a
parallel renderer: RenderCV's own template-override mechanism
(``render_single_template`` checks the input file's directory before its
bundled templates - see ``rendercv/renderer/templater/templater.py``) is used
exactly as designed, with a Jinja2 environment cached per input path so two
concurrent renders never share one. Every other template (section beginnings,
entries, endings) is RenderCV's bundled one, untouched - section order,
headings and separators come from the SAME mapped document as the PDF, which
is what T090 pins.
"""

import shutil
import tempfile
from functools import partial
from pathlib import Path
from typing import NamedTuple

import anyio
import anyio.to_thread
from rendercv.renderer.templater.templater import render_full_template
from rendercv.schema.rendercv_model_builder import (
    build_rendercv_dictionary_and_model,
)

from app.application.services.cv_rendering.mapper import (
    THEME_NAME,
    TYPST_ESCAPED_HASH,
    RenderableCV,
    map_cv_to_rendercv_yaml,
)
from app.application.services.cv_rendering.renderer import (
    THEME_SOURCE_DIR,
    slugify,
)
from app.config.logging import logger
from app.config.settings import envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import CVExportFailed

# The one-file override for the Markdown header, copied next to every
# render's input file the same way ``THEME_SOURCE_DIR`` is. See the module
# docstring for why it exists.
HEADER_OVERRIDE_SOURCE = (
    Path(__file__).parent / 'markdown_overrides' / 'Header.j2.md'
)

INPUT_FILE_NAME = 'cv.yaml'
OUTPUT_DIR_NAME = 'out'

RENDER_FAILED_MESSAGE = 'Could not render the CV Markdown'


class RenderedMarkdown(NamedTuple):
    """Finished Markdown text plus the name the browser should save it under."""

    content: str
    filename: str


def markdown_filename(name: str) -> str:
    """The ``filename=`` value of the ``Content-Disposition`` header.

    Same slug as :func:`app.application.services.cv_rendering.renderer.pdf_filename`
    - the PDF slug with ``.md`` instead of ``.pdf``, per T090.
    """
    return f'{slugify(name)}.md'


def _render_sync(yaml_text: str, work_dir: Path) -> str:
    """Build the RenderCV model and render it as Markdown. Runs in a thread."""
    shutil.copytree(
        THEME_SOURCE_DIR,
        work_dir / THEME_NAME,
        ignore=shutil.ignore_patterns('__pycache__'),
    )
    markdown_override_dir = work_dir / 'markdown'
    markdown_override_dir.mkdir()
    shutil.copy2(HEADER_OVERRIDE_SOURCE, markdown_override_dir / 'Header.j2.md')

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
    markdown = render_full_template(model, 'markdown')
    # The mapper defuses ``#word`` for Typst (``#sym.hash...``); Markdown
    # needs the literal ``#`` back, or "#opentowork" reads as Typst source.
    return markdown.replace(TYPST_ESCAPED_HASH, '#')


class CVMarkdownRenderer:
    """Renders a stored CV document into Markdown text, same theme as the PDF.

    One implementation, no options - like :class:`CVPdfRenderer`, there is no
    way for a caller to ask for a different look or a different theme.
    """

    def __init__(self, timeout_seconds: int | None = None):
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else envs.CV_PDF_RENDER_TIMEOUT_SECONDS
        )

    async def render(self, cv: RenderableCV) -> RenderedMarkdown:
        """Render ``cv`` and return its Markdown text and download filename.

        Raises:
            CVExportFailed: the render failed or ran past the timeout.
        """
        yaml_text = map_cv_to_rendercv_yaml(cv)
        work_dir = Path(tempfile.mkdtemp(prefix='applika-cv-md-'))
        try:
            with anyio.fail_after(self.timeout_seconds):
                content = await anyio.to_thread.run_sync(
                    partial(_render_sync, yaml_text, work_dir),
                    abandon_on_cancel=True,
                )
        except TimeoutError as exc:
            logger.warning(
                'CV Markdown render timed out',
                extra={
                    'extra_data': {
                        'event': 'cv.markdown.render_timeout',
                        'timeout_seconds': self.timeout_seconds,
                    }
                },
            )
            raise CVExportFailed(
                RENDER_FAILED_MESSAGE, ErrorCode.CV_MARKDOWN_RENDER_FAILED
            ) from exc
        except Exception as exc:
            # Only the exception's *type* is logged, never its message: same
            # discipline as CVPdfRenderer.render - a RenderCV error message
            # quotes the CV field that upset it.
            logger.error(
                'CV Markdown render failed',
                extra={
                    'extra_data': {
                        'event': 'cv.markdown.render_failed',
                        'error_type': type(exc).__name__,
                    }
                },
            )
            raise CVExportFailed(
                RENDER_FAILED_MESSAGE, ErrorCode.CV_MARKDOWN_RENDER_FAILED
            ) from exc
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

        return RenderedMarkdown(
            content=content, filename=markdown_filename(cv.name)
        )


def get_cv_markdown_renderer() -> CVMarkdownRenderer:
    """Factory used by the DI layer."""
    return CVMarkdownRenderer()
