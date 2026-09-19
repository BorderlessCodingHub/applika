"""Unit tests for the diff PDF renderer (KODI-017, T091).

Real Typst compile, no database: the diff PDF is "the same content as the
Markdown" (T091) wrapped in a minimal template that prints it through
``#raw`` and Typst's ``sys.inputs``, so nothing here needs escaping - see
``diff_pdf_renderer.py`` and ``diff_template/diff.typ`` for why.
"""

import time
from pathlib import Path
from typing import Any

import pytest

from app.application.services.cv_rendering import (
    diff_pdf_renderer as diff_pdf_renderer_module,
)
from app.application.services.cv_rendering.diff_pdf_renderer import (
    CVDiffPdfRenderer,
    diff_pdf_filename,
)
from app.core.exceptions import CVExportFailed

PDF_MAGIC = b'%PDF-'


async def test_diff_pdf_compiles_and_starts_with_the_pdf_magic_bytes():
    rendered = await CVDiffPdfRenderer().render(
        '# Changes to Backend CV\n\nCompared with Master CV: 1 changes\n\n'
        '## Identity and contact (1)\n- Changed Headline: A -> B\n',
        'backend-cv',
    )
    assert rendered.content.startswith(PDF_MAGIC)
    assert rendered.filename == 'backend-cv-changes.pdf'


async def test_diff_pdf_handles_markup_special_characters_unescaped():
    """Free-text CV content may itself contain Typst markup syntax.

    ``sys.inputs`` means none of it needs escaping; a compile that survives
    ``#``, ``[``, ``]``, ``*`` and a literal quote in the content is the
    proof.
    """
    rendered = await CVDiffPdfRenderer().render(
        '# Changes to Weird CV\n\n'
        'Compared with Master CV: 1 changes\n\n'
        '## Summary (1)\n'
        '- Changed Summary: #opentowork [old] -> "new" * text\n',
        'weird-cv',
    )
    assert rendered.content.startswith(PDF_MAGIC)


def test_diff_pdf_filename_appends_changes_pdf():
    assert diff_pdf_filename('backend-cv') == 'backend-cv-changes.pdf'


async def test_render_failure_raises_cv_export_failed(monkeypatch):
    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('typst said no')

    monkeypatch.setattr(diff_pdf_renderer_module, '_compile_sync', _boom)
    with pytest.raises(CVExportFailed):
        await CVDiffPdfRenderer().render('content', 'slug')


async def test_render_failure_removes_the_temp_directory(monkeypatch):
    created: dict[str, Path] = {}
    real_mkdtemp = diff_pdf_renderer_module.tempfile.mkdtemp

    def _spy_mkdtemp(*args: Any, **kwargs: Any) -> str:
        path = real_mkdtemp(*args, **kwargs)
        created['path'] = Path(path)
        return path

    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('typst said no')

    monkeypatch.setattr(
        diff_pdf_renderer_module.tempfile, 'mkdtemp', _spy_mkdtemp
    )
    monkeypatch.setattr(diff_pdf_renderer_module, '_compile_sync', _boom)

    with pytest.raises(CVExportFailed):
        await CVDiffPdfRenderer().render('content', 'slug')

    assert not created['path'].exists()


async def test_render_timeout_raises_cv_export_failed(monkeypatch):
    def _slow(*args: Any, **kwargs: Any):
        time.sleep(0.5)
        return b''

    monkeypatch.setattr(diff_pdf_renderer_module, '_compile_sync', _slow)
    with pytest.raises(CVExportFailed):
        await CVDiffPdfRenderer(timeout_seconds=0).render('content', 'slug')
