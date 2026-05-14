"""Keyword extraction and fit scoring — dependency-free."""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

_STOPWORDS: frozenset[str] = frozenset(
    """
    a an the and or of for to with in on at by from as is are was were be been being
    this that these those it its they them their there here we our you your
    will can should would could may might must shall not no nor do does did done
    have has had having if then else when while who whom which what where why how
    about above below across after before between into through during
    against without within per via than so such same some any all each other
    more most less least very much many few several etc eg ie vs
    job role team company work working worked position experience experienced
    candidate candidates looking looking-for responsibilities responsibility
    must-have nice-to-have requirements required strong preferred bonus plus
    """.split()
)

_TOKEN_RE = re.compile(
    r'[A-Za-z][A-Za-z0-9\+\#\-]*(?:\.[A-Za-z0-9\+\#\-]+)*'
)
_BOUNDARY_CHARS = frozenset(',;:|()[]{}\"\n\r\t/!?')
_TRAILING_JUNK = re.compile(r'[\.\-]+$')

_TOP_JD_KEYWORDS = 25
_BIGRAM_WEIGHT = 2.0
_UNIGRAM_WEIGHT = 1.0


@dataclass(frozen=True)
class KeywordStats:
    unigrams: Counter[str]
    bigrams: Counter[str]

    def top(self, n: int = 20) -> list[str]:
        merged: Counter[str] = Counter()
        merged.update(self.bigrams)
        merged.update(self.unigrams)
        return [k for k, _ in merged.most_common(n)]


def _clean_token(t: str) -> str:
    return _TRAILING_JUNK.sub('', t.lower())


def _keep(t: str) -> bool:
    if not t or t in _STOPWORDS:
        return False
    if len(t) == 1 and t not in {'c', 'r'}:
        return False
    return True


def _is_boundary(gap: str) -> bool:
    if any(c in _BOUNDARY_CHARS for c in gap):
        return True
    if '.' in gap:
        idx = gap.index('.')
        trailing = gap[idx + 1:]
        if trailing == '' or trailing.isspace():
            return True
    return False


def tokenize(text: str) -> list[str]:
    segments = tokenize_segments(text)
    return [t for seg in segments for t in seg]


def tokenize_segments(text: str) -> list[list[str]]:
    if not text:
        return []
    matches = list(_TOKEN_RE.finditer(text))
    segments: list[list[str]] = []
    current: list[str] = []
    prev_end = 0
    for m in matches:
        gap = text[prev_end: m.start()]
        if current and _is_boundary(gap):
            segments.append(current)
            current = []
        tok = _clean_token(m.group(0))
        if _keep(tok):
            current.append(tok)
        prev_end = m.end()
    if current:
        segments.append(current)
    return segments


def extract(text: str) -> KeywordStats:
    segments = tokenize_segments(text)
    uni: Counter[str] = Counter()
    bi: Counter[str] = Counter()
    for seg in segments:
        uni.update(seg)
        for a, b in zip(seg, seg[1:]):
            bi[f'{a} {b}'] += 1
    return KeywordStats(unigrams=uni, bigrams=bi)


def keyword_set(text: str) -> set[str]:
    stats = extract(text)
    return set(stats.unigrams) | set(stats.bigrams)


@dataclass(frozen=True)
class FitReport:
    score: int
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            'score': self.score,
            'matched_keywords': list(self.matched_keywords),
            'missing_keywords': list(self.missing_keywords),
        }


def score_fit(resume_text: str, jd_text: str) -> FitReport:
    jd = extract(jd_text)
    resume = extract(resume_text)

    jd_top_unigrams = [
        k for k, _ in jd.unigrams.most_common(_TOP_JD_KEYWORDS)
    ]
    jd_top_bigrams = [
        k for k, _ in jd.bigrams.most_common(_TOP_JD_KEYWORDS)
    ]

    resume_unigrams = set(resume.unigrams)
    resume_bigrams = set(resume.bigrams)

    def _bigram_matches(b: str) -> bool:
        if b in resume_bigrams:
            return True
        a, c = b.split(' ', 1)
        return a in resume_unigrams and c in resume_unigrams

    matched_uni = [k for k in jd_top_unigrams if k in resume_unigrams]
    missing_uni = [k for k in jd_top_unigrams if k not in resume_unigrams]
    matched_bi = [k for k in jd_top_bigrams if _bigram_matches(k)]
    missing_bi = [k for k in jd_top_bigrams if not _bigram_matches(k)]

    max_score = (
        len(jd_top_unigrams) * _UNIGRAM_WEIGHT
        + len(jd_top_bigrams) * _BIGRAM_WEIGHT
    )
    achieved = (
        len(matched_uni) * _UNIGRAM_WEIGHT
        + len(matched_bi) * _BIGRAM_WEIGHT
    )
    score = 0 if max_score <= 0 else round(100 * achieved / max_score)

    matched = matched_bi + matched_uni
    missing = missing_bi + missing_uni
    return FitReport(
        score=score,
        matched_keywords=matched[:20],
        missing_keywords=missing[:15],
    )
