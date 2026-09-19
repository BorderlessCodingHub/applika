"""Unit tests for the CV Markdown renderer (KODI-017, T090).

Real work, no database and no HTTP: :class:`CVMarkdownRenderer` runs RenderCV
2.8's own Markdown templater against the SAME mapped document the PDF path
builds. What these tests pin:

* Section order and headings match ``SECTION_ORDER`` (mapper.py) - the same
  order the PDF typesets, proven the same way ``test_cv_rendering.py`` proves
  it for Typst: reading the generated text, not a parsed structure.
* An empty optional section leaves no heading, same rule as the PDF.
* The one documented override: a link that is not a known social network
  (``custom_connections`` in mapper terms) appears in the Markdown header -
  RenderCV's own bundled ``Header.j2.md`` template drops it (see
  ``markdown_renderer.py``'s module docstring for the empirical proof), so
  this is the regression test for the override that fixes it.
* The filename is the PDF slug with ``.md``.
* A render failure raises ``CVExportFailed`` and leaves no temp directory.
"""

import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from app.application.dto.base_cv import BaseCVDTO
from app.application.services.cv_rendering import (
    markdown_renderer as markdown_renderer_module,
)
from app.application.services.cv_rendering.mapper import SECTION_ORDER
from app.application.services.cv_rendering.markdown_renderer import (
    CVMarkdownRenderer,
    markdown_filename,
)
from app.core.exceptions import CVExportFailed

FULL_SECTIONS: dict[str, Any] = {
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'},
        {'id': 'lnk-2', 'label': 'Site', 'url': 'https://ada.example.com'},
    ],
    'skills': [
        {
            'id': 'skl-1',
            'category': 'Languages & Frameworks',
            'keywords': ['Python', 'PostgreSQL'],
        }
    ],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'role': 'Staff Engineer',
            'start': '2024-02',
            'bullets': ['Cut p99 by half'],
        }
    ],
    'projects': [],
    'education': [
        {
            'id': 'edu-1',
            'institution': 'Riverside Institute',
            'degree': "Master's degree",
            'start': '2016-09',
            'end': '2018-07',
        }
    ],
    'certifications': [],
    'languages': [{'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'}],
}


def _cv(**overrides: Any) -> BaseCVDTO:
    body: dict[str, Any] = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'user_id': 1,
        'name': 'Backend CV',
        'full_name': 'Ada Example',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+1 202 555 0147',
        'summary': 'Ten years of backend engineering.',
        **FULL_SECTIONS,
    }
    body.update(overrides)
    return BaseCVDTO(**body)


# ``# <Heading>`` at the start of a line - every section heading and the
# name heading both use this, so section headings are picked out by matching
# against the known section titles.
_HEADINGS = re.compile(r'^# (.+)$', re.MULTILINE)


def _section_headings(markdown: str) -> list[str]:
    return [h for h in _HEADINGS.findall(markdown) if h in SECTION_ORDER]


async def test_section_order_matches_the_pdf_path():
    """``projects`` and ``certifications`` are empty in this fixture and
    print no heading (see the next test), so the expectation is
    ``SECTION_ORDER`` minus those two - still in the same relative order.
    """
    rendered = await CVMarkdownRenderer().render(_cv())
    expected = [
        title
        for title in SECTION_ORDER
        if title not in ('Projects', 'Certifications')
    ]
    assert _section_headings(rendered.content) == expected


async def test_empty_optional_sections_leave_no_heading():
    rendered = await CVMarkdownRenderer().render(_cv())
    # ``projects`` and ``certifications`` are empty in FULL_SECTIONS.
    assert 'Projects' not in _section_headings(rendered.content)
    assert 'Certifications' not in _section_headings(rendered.content)


async def test_a_custom_connection_link_appears_in_the_header():
    """The regression test for the ``Header.j2.md`` override.

    ``ada.example.com`` is not a RenderCV-recognised social network, so it
    maps to a ``custom_connections`` entry (mapper.py); RenderCV's own
    bundled Markdown header template drops those, which is exactly what the
    override in ``markdown_overrides/Header.j2.md`` fixes.
    """
    rendered = await CVMarkdownRenderer().render(_cv())
    header = rendered.content.split('# Summary', 1)[0]
    assert 'ada.example.com' in header, header


async def test_a_known_social_network_link_still_appears_in_the_header():
    rendered = await CVMarkdownRenderer().render(_cv())
    header = rendered.content.split('# Summary', 1)[0]
    assert 'github.com/ada' in header, header


def test_markdown_filename_is_the_pdf_slug_with_md():
    assert markdown_filename('Senior Backend CV (2026)') == (
        'senior-backend-cv-2026.md'
    )


async def test_render_failure_raises_cv_export_failed(monkeypatch):
    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('jinja said no')

    monkeypatch.setattr(markdown_renderer_module, '_render_sync', _boom)
    with pytest.raises(CVExportFailed):
        await CVMarkdownRenderer().render(_cv())


async def test_render_failure_removes_the_temp_directory(monkeypatch):
    created: dict[str, Path] = {}
    real_mkdtemp = markdown_renderer_module.tempfile.mkdtemp

    def _spy_mkdtemp(*args: Any, **kwargs: Any) -> str:
        path = real_mkdtemp(*args, **kwargs)
        created['path'] = Path(path)
        return path

    def _boom(*args: Any, **kwargs: Any):
        raise RuntimeError('jinja said no')

    monkeypatch.setattr(
        markdown_renderer_module.tempfile, 'mkdtemp', _spy_mkdtemp
    )
    monkeypatch.setattr(markdown_renderer_module, '_render_sync', _boom)

    with pytest.raises(CVExportFailed):
        await CVMarkdownRenderer().render(_cv())

    assert not created['path'].exists()


async def test_a_render_that_succeeds_removes_the_temp_directory(
    monkeypatch,
):
    created: dict[str, Path] = {}
    real_mkdtemp = markdown_renderer_module.tempfile.mkdtemp

    def _spy_mkdtemp(*args: Any, **kwargs: Any) -> str:
        path = real_mkdtemp(*args, **kwargs)
        created['path'] = Path(path)
        return path

    monkeypatch.setattr(
        markdown_renderer_module.tempfile, 'mkdtemp', _spy_mkdtemp
    )

    await CVMarkdownRenderer().render(_cv())

    assert not created['path'].exists()


async def test_the_headline_appears_in_the_header():
    """The applika Typst header prints the headline; the Markdown must too."""
    rendered = await CVMarkdownRenderer().render(_cv())
    header = rendered.content.split('# Summary', 1)[0]
    assert 'Staff Backend Engineer' in header, header


async def test_a_hashtag_reads_verbatim_not_as_the_typst_escape():
    """``#word`` is defused for Typst by the mapper; Markdown gets it back."""
    rendered = await CVMarkdownRenderer().render(
        _cv(
            summary='I am #opentowork',
            experience=[
                {
                    'id': 'exp-1',
                    'company': 'Acme',
                    'company_description': 'Home of #DevOps',
                    'role': 'Staff Engineer',
                    'start': '2024-02',
                    'bullets': ['Led #DevOps'],
                }
            ],
        )
    )
    assert 'I am #opentowork' in rendered.content
    assert 'Led #DevOps' in rendered.content
    assert 'Home of #DevOps' in rendered.content
    assert 'sym.hash' not in rendered.content


async def test_render_timeout_raises_cv_export_failed(monkeypatch):
    def _slow(*args: Any, **kwargs: Any):
        time.sleep(0.5)
        return ''

    monkeypatch.setattr(markdown_renderer_module, '_render_sync', _slow)
    with pytest.raises(CVExportFailed):
        await CVMarkdownRenderer(timeout_seconds=0).render(_cv())
