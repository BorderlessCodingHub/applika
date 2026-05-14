"""ATS-friendly output rules — no external dependencies."""
from __future__ import annotations

from dataclasses import dataclass

ATS_SECTIONS: tuple[str, ...] = (
    'Summary',
    'Skills',
    'Experience',
    'Education',
    'Projects',
    'Certifications',
)

_BULLET_REPLACEMENTS = {
    '•': '-',
    '·': '-',
    '●': '-',
    '▪': '-',
    '◦': '-',
    '►': '-',
    '➤': '-',
    '✓': '-',
    '✔': '-',
    '★': '-',
    '–': '-',
    '—': '-',
}


def normalize_bullets(text: str) -> str:
    out = text
    for glyph, repl in _BULLET_REPLACEMENTS.items():
        out = out.replace(glyph, repl)
    return '\n'.join(line.rstrip() for line in out.splitlines())


def is_ats_section_heading(line: str) -> bool:
    stripped = line.strip().rstrip(':').title()
    return stripped in ATS_SECTIONS


@dataclass(frozen=True)
class AtsCheck:
    ok: bool
    warnings: list[str]


def check(text: str, jd_keywords: list[str]) -> AtsCheck:
    warnings: list[str] = []
    lowered = text.lower()

    if any(ch in text for ch in _BULLET_REPLACEMENTS):
        warnings.append(
            'Uses non-plain bullet characters; normalized copy recommended.'
        )

    if len(text.strip()) < 300:
        warnings.append(
            'CV looks too short — ATS parsers may discard it as blank.'
        )

    missing_from_cv = [
        k for k in jd_keywords if k and k.lower() not in lowered
    ]
    if missing_from_cv:
        warnings.append(
            'JD keywords not present in CV: '
            + ', '.join(missing_from_cv[:10])
        )

    present_sections = [s for s in ATS_SECTIONS if s.lower() in lowered]
    if len(present_sections) < 2:
        warnings.append(
            'Fewer than two standard section headings detected '
            '(Summary, Skills, Experience, …).'
        )

    return AtsCheck(ok=len(warnings) == 0, warnings=warnings)
