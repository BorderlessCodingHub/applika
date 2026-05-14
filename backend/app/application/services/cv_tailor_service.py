"""Heuristic CV tailoring — no LLM required."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.application.services import ats_service
from app.application.services.keywords_service import score_fit


# ---------- Schema dataclasses -------------------------------------------


@dataclass
class ExperienceEntry:
    role: str = ''
    company: str = ''
    period: str = ''
    bullets: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'role': self.role,
            'company': self.company,
            'period': self.period,
            'bullets': list(self.bullets),
        }


@dataclass
class EducationEntry:
    institution: str = ''
    degree: str = ''
    year: str = ''

    def as_dict(self) -> dict:
        return {
            'institution': self.institution,
            'degree': self.degree,
            'year': self.year,
        }


@dataclass
class TailoredCv:
    name: str = ''
    headline: str = ''
    summary: str = ''
    skills: list[str] = field(default_factory=list)
    experience: list[ExperienceEntry] = field(default_factory=list)
    education: list[EducationEntry] = field(default_factory=list)
    projects: list[str] = field(default_factory=list)
    ats_warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'name': self.name,
            'headline': self.headline,
            'summary': self.summary,
            'skills': list(self.skills),
            'experience': [e.as_dict() for e in self.experience],
            'education': [e.as_dict() for e in self.education],
            'projects': list(self.projects),
            'ats_warnings': list(self.ats_warnings),
        }


# ---------- Structural resume parser ------------------------------------

_HEADING_SKILLS = re.compile(r'^\s*skills\b', re.IGNORECASE)
_HEADING_EXPERIENCE = re.compile(
    r'^\s*(experience|work experience|professional experience|employment)\b',
    re.IGNORECASE,
)
_HEADING_EDUCATION = re.compile(r'^\s*education\b', re.IGNORECASE)
_HEADING_PROJECTS = re.compile(
    r'^\s*(projects|side projects)\b', re.IGNORECASE
)
_HEADING_SUMMARY = re.compile(
    r'^\s*(summary|profile|about)\b', re.IGNORECASE
)
_SECTION_ALL = (
    _HEADING_SKILLS,
    _HEADING_EXPERIENCE,
    _HEADING_EDUCATION,
    _HEADING_PROJECTS,
    _HEADING_SUMMARY,
)
_BULLET_RE = re.compile(r'^\s*[-\*•●▪◦►➤]+\s*(.+)$')


@dataclass
class _ParsedStructure:
    name: str = ''
    summary: str = ''
    skills: list[str] = field(default_factory=list)
    experience: list[ExperienceEntry] = field(default_factory=list)
    education: list[EducationEntry] = field(default_factory=list)
    projects: list[str] = field(default_factory=list)
    raw_lines: list[str] = field(default_factory=list)


def _is_heading(line: str) -> bool:
    return any(p.match(line) for p in _SECTION_ALL)


def _parse_experience_block(block: str) -> ExperienceEntry | None:
    lines = [ln for ln in block.splitlines() if ln.strip()]
    if not lines:
        return None
    header = lines[0]
    role = header
    company = ''
    period = ''
    sep = ' — ' if ' — ' in header else (' - ' if ' - ' in header else '')
    if sep:
        left, right = header.split(sep, 1)
        role = left.strip()
        rest = right.strip()
    else:
        rest = ''
    if ' at ' in role:
        role, company_tail = role.split(' at ', 1)
        rest = (rest + ' ' + company_tail).strip()
    if rest:
        if ',' in rest:
            company, period = [p.strip() for p in rest.split(',', 1)]
        elif '(' in rest and rest.endswith(')'):
            company = rest[: rest.rfind('(')].strip()
            period = rest[rest.rfind('(') + 1: -1].strip()
        else:
            company = rest
    bullets: list[str] = []
    for line in lines[1:]:
        m = _BULLET_RE.match(line)
        if m:
            bullets.append(m.group(1).strip())
        elif line.strip():
            bullets.append(line.strip())
    return ExperienceEntry(
        role=role.strip(),
        company=company.strip(),
        period=period.strip(),
        bullets=bullets,
    )


def _parse_education_block(block: str) -> EducationEntry | None:
    line = next(
        (ln.strip() for ln in block.splitlines() if ln.strip()), ''
    )
    if not line:
        return None
    parts = [
        p.strip()
        for p in re.split(r'[—\-,]', line)
        if p.strip()
    ]
    if len(parts) == 1:
        return EducationEntry(institution=parts[0])
    if len(parts) == 2:
        return EducationEntry(institution=parts[0], degree=parts[1])
    return EducationEntry(
        institution=parts[0], degree=parts[1], year=parts[-1]
    )


def _parse_resume_structure(text: str) -> _ParsedStructure:
    lines = [line.rstrip() for line in (text or '').splitlines()]
    ps = _ParsedStructure(
        raw_lines=[line for line in lines if line.strip()]
    )

    for line in lines:
        s = line.strip()
        if not s:
            continue
        if any(ch.isdigit() for ch in s):
            continue
        if len(s) > 60:
            continue
        ps.name = s
        break

    section: str = ''
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        if not buf:
            return
        joined = '\n'.join(buf).strip()
        if section == 'summary':
            ps.summary = (ps.summary + ' ' + joined).strip()
        elif section == 'skills':
            parts = re.split(r'[,•\n]', joined)
            ps.skills.extend(p.strip() for p in parts if p.strip())
        elif section == 'experience':
            entry = _parse_experience_block(joined)
            if entry:
                ps.experience.append(entry)
        elif section == 'education':
            entry = _parse_education_block(joined)
            if entry:
                ps.education.append(entry)
        elif section == 'projects':
            for ln in joined.splitlines():
                m = _BULLET_RE.match(ln)
                if m:
                    ps.projects.append(m.group(1).strip())
                elif ln.strip():
                    ps.projects.append(ln.strip())
        buf.clear()

    for line in lines:
        if _is_heading(line):
            flush()
            if _HEADING_SUMMARY.match(line):
                section = 'summary'
            elif _HEADING_SKILLS.match(line):
                section = 'skills'
            elif _HEADING_EXPERIENCE.match(line):
                section = 'experience'
            elif _HEADING_EDUCATION.match(line):
                section = 'education'
            elif _HEADING_PROJECTS.match(line):
                section = 'projects'
            else:
                section = ''
            continue
        if section == 'experience' and not line.strip() and buf:
            flush()
            continue
        buf.append(line)
    flush()
    return ps


# ---------- Heuristic helpers --------------------------------------------


def _reorder_by_match(
    items: list[str], jd_keywords: list[str]
) -> list[str]:
    jd_lc = {k.lower() for k in jd_keywords}
    hits = [i for i in items if i.lower() in jd_lc]
    rest = [i for i in items if i.lower() not in jd_lc]
    return hits + rest


def _reorder_bullets(
    entry: ExperienceEntry, matched_keywords: list[str]
) -> ExperienceEntry:
    kw_lc = {k.lower() for k in matched_keywords}

    def score(bullet: str) -> int:
        low = bullet.lower()
        return sum(1 for k in kw_lc if k and k in low)

    bullets = sorted(entry.bullets, key=score, reverse=True)
    return ExperienceEntry(
        role=entry.role,
        company=entry.company,
        period=entry.period,
        bullets=bullets,
    )


def _entry_from_raw(raw_lines: list[str]) -> ExperienceEntry:
    return ExperienceEntry(
        role='Background',
        company='',
        period='',
        bullets=raw_lines[:15],
    )


# ---------- Public API ---------------------------------------------------


def render_cv_plaintext(cv: TailoredCv) -> str:
    parts: list[str] = [cv.name, '', 'Summary', cv.summary, '']
    if cv.skills:
        parts.extend(['Skills', ', '.join(cv.skills), ''])
    if cv.experience:
        parts.append('Experience')
        for e in cv.experience:
            parts.append(
                f'{e.role} — {e.company} ({e.period})'.strip(' -(')
            )
            parts.extend(f'- {b}' for b in e.bullets)
            parts.append('')
    if cv.education:
        parts.append('Education')
        for e in cv.education:
            parts.append(
                f'{e.institution} — {e.degree} ({e.year})'
            )
        parts.append('')
    if cv.projects:
        parts.append('Projects')
        parts.extend(f'- {p}' for p in cv.projects)
    return '\n'.join(parts)


def tailor_cv_heuristic(
    resume_text: str, jd_text: str
) -> TailoredCv:
    fit = score_fit(resume_text, jd_text)
    structure = _parse_resume_structure(resume_text)
    jd_keywords = fit.matched_keywords + fit.missing_keywords

    cv = TailoredCv(
        name=structure.name or '',
        headline='',
        summary=(
            structure.summary
            or 'Engineer with relevant experience, tailored to this role.'
        ),
        skills=_reorder_by_match(
            structure.skills or jd_keywords[:15], jd_keywords
        ),
        experience=[
            _reorder_bullets(e, fit.matched_keywords)
            for e in structure.experience
        ],
        education=list(structure.education),
        projects=list(structure.projects),
    )

    if not cv.experience and structure.raw_lines:
        cv.experience = [
            _reorder_bullets(
                _entry_from_raw(structure.raw_lines), fit.matched_keywords
            )
        ]

    cv_text = render_cv_plaintext(cv)
    cv.ats_warnings = ats_service.check(
        cv_text, jd_keywords=jd_keywords
    ).warnings
    return cv
