"""Keyword fit of a CV for a job - pure functions, no I/O (ADR-0017).

A port of Ían Muliterno's ``keywords_service.py`` (``job_scrapping`` branch,
commit ``e670914``) onto applika's structured CV, narrowed to the rules
ADR-0017 pins:

* **Job keywords** - :func:`job_keywords`: the 25 most frequent terms and the
  25 most frequent word pairs of the job text, English stop words removed,
  plus the job's tags.
* **CV text** - :func:`cv_text`: headline, summary, skill keywords,
  experience roles and bullets, project names and descriptions, and
  certifications. Email, phone, location, links, education and languages
  never count.
* **Score** - :func:`score_fit`: ``round(100 x matched / len(keywords))``,
  a whole number from 0 to 100, with the matched and missing lists. No
  keywords at all gives ``score=None`` ("no fit"), never a fake 0.

Everything here is deterministic: no model, no network, no clock, no
randomness, and every ordering has an explicit tie-break. The same CV and
the same job always give the same result.

Matching is literal and case-insensitive, on whole words and whole phrases:
``java`` does not match ``javascript``, and the pair ``machine learning``
only matches where those two words stand next to each other in one sentence
of the CV.
"""

import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import TailoredCVContent

# How many terms and how many word pairs a job contributes (ADR-0017).
TOP_TERMS = 25
TOP_PAIRS = 25

# English stop words plus the posting boilerplate that says nothing about a
# skill ("experience", "team", "requirements"...). Ían's list, extended with
# the pronouns and auxiliaries a posting also uses.
_STOP_WORDS: frozenset[str] = frozenset(
    """
    a an the and or of for to with in on at by from as is are was were be been
    being this that these those it its they them their there here we our us
    you your yours i me my he she his her will can should would could may
    might must shall not no nor do does did done have has had having if then
    else when while who whom which what where why how about above below
    across after before between into through during against without within
    per via than so such same some any all each other more most less least
    very much many few several etc eg ie vs also just only both either neither
    up down out over under again further once own too
    job jobs role roles team teams company work working worked position
    experience experienced candidate candidates looking responsibilities
    responsibility requirements required preferred strong bonus plus need
    needs
    """.split()
)

# A word: starts with a letter or a digit - any script, so ``5g``, ``3d``,
# ``2fa`` and ``résumé`` are words - and may carry letters, digits and the
# ``+ # -`` that make ``c++``, ``c#`` and ``full-stack`` single terms, inner
# dots (``node.js``), and one leading dot (``.net``, so the tag ``.NET``
# never matches "Net income"; a dot after a word is already that word's
# inner dot, ``acme.net``). A trailing dot or hyphen is punctuation, not
# the word. ``_`` is not a word character, as before (KODI-046 widening,
# owner 2026-10-12).
_WORD_CHAR = r'(?:[^\W_]|[+#\-])'
_WORD_RE = re.compile(rf'\.?[^\W_]{_WORD_CHAR}*(?:\.{_WORD_CHAR}+)*')
_TRAILING_JUNK_RE = re.compile(r'[.\-]+$')
_WHITESPACE_RE = re.compile(r'\s+')
# A letter or digit the word pattern could not take: a tag that holds one
# would be matched truncated, so it is dropped. With the pattern above only
# a letter or digit glued to ``_`` is left out.
_UNMATCHABLE_RE = re.compile(r'[^\W_]')
# Sentence punctuation around a whole tag (``Python,``) is not part of it.
_TAG_EDGE_RE = re.compile(r'^[,;:!?]+|[,;:!?.]+$')
_LETTER_RE = re.compile(r'[^\W\d_]')

# Single letters are noise except the two that are languages.
_SINGLE_LETTER_TERMS = frozenset({'c', 'r'})


@dataclass(frozen=True)
class FitResult:
    """The fit of one CV for one job.

    ``score`` is ``None`` when the job has no keywords (a blank description
    and no tags): there is nothing to fit, so no number is invented.
    """

    score: int | None
    matched: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def _clean(token: str) -> str:
    return _TRAILING_JUNK_RE.sub('', token)


def _words(line: str) -> list[tuple[str, str]]:
    """The words of one line, each with the punctuation just before it.

    The gap before a word keeps only its non-whitespace characters, so any
    run of spaces - non-breaking ones from a pasted posting included - is
    ``''`` and ``CI / CD`` and ``CI/CD`` both carry ``'/'``. Punctuation cut
    off the end of the previous word belongs to the gap too: in
    ``machine- learning`` the gap before ``learning`` is ``'-'``, so the
    two never form the pair ``machine learning``.
    """
    lowered = line.lower()
    words: list[tuple[str, str]] = []
    previous_end = 0
    carried = ''
    for match in _WORD_RE.finditer(lowered):
        gap = _WHITESPACE_RE.sub('', lowered[previous_end : match.start()])
        raw = match.group(0)
        word = _clean(raw)
        words.append((word, carried + gap))
        carried = raw[len(word) :]
        previous_end = match.end()
    return words


def _segments(text: str) -> list[list[str]]:
    """Split text into runs of words that stand next to each other.

    Two words are adjacent only when nothing but whitespace on one line
    separates them; any punctuation or line break ends the run. Word pairs
    are taken within a run only, so a pair is always a real phrase of the
    text.
    """
    segments: list[list[str]] = []
    for line in text.splitlines():
        current: list[str] = []
        for word, gap in _words(line):
            if current and gap:
                segments.append(current)
                current = []
            current.append(word)
        if current:
            segments.append(current)
    return segments


def _is_term(word: str) -> bool:
    """A stop word, a lone letter (but ``c``/``r``) or a token with no
    letter at all (``2024``, ``3``, ``10+``) is never a term."""
    if word in _STOP_WORDS or not _LETTER_RE.search(word):
        return False
    return len(word) > 1 or word in _SINGLE_LETTER_TERMS


def _most_frequent(counter: Counter[str], limit: int) -> list[str]:
    """Frequency descending, then alphabetical: no tie is left to chance."""
    ranked = sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    return [term for term, _ in ranked[:limit]]


def _tag_keyword(tag: str) -> str | None:
    """A tag as a keyword: trimmed, lower case, inner whitespace collapsed,
    sentence punctuation around it removed (``Python,`` is ``python``).

    ``None`` for a tag that could never be matched as written: no word at
    all (``-``, ``#``), a letter or digit the word pattern drops, or a
    single stop word or stray letter. Digits and letters of any script are
    words (``5G``, ``Vue 3``, ``Résumé``).
    """
    keyword = _TAG_EDGE_RE.sub('', ' '.join(tag.split()).lower()).strip()
    words = _words(keyword)
    if not words or _UNMATCHABLE_RE.search(_WORD_RE.sub('', keyword)):
        return None
    if len(words) == 1 and not _is_term(words[0][0]):
        return None
    return keyword


def job_keywords(text: str | None, tags: Iterable[str]) -> list[str]:
    """The keywords a job is scored on.

    The 25 most frequent terms, then the 25 most frequent word pairs, then
    the tags (trimmed and lower-cased, see :func:`_tag_keyword`). A stop word is never a term and
    breaks a pair: "design of systems" yields no pair. De-duplicated in that
    order, so a tag already found in the text is listed once.
    """
    terms: Counter[str] = Counter()
    pairs: Counter[str] = Counter()
    for segment in _segments(text or ''):
        run: list[str] = []
        for word in [*segment, '']:
            if word and _is_term(word):
                run.append(word)
                continue
            terms.update(run)
            pairs.update(f'{a} {b}' for a, b in zip(run, run[1:]))
            run = []

    keywords = [
        *_most_frequent(terms, TOP_TERMS),
        *_most_frequent(pairs, TOP_PAIRS),
        *(_tag_keyword(tag) for tag in tags),
    ]
    seen: set[str] = set()
    unique: list[str] = []
    for keyword in keywords:
        if keyword and keyword not in seen:
            seen.add(keyword)
            unique.append(keyword)
    return unique


def cv_text(content: TailoredCVContent | BaseCVDTO) -> str:
    """The text of a CV that a job's keywords are matched against.

    One line per value, so a phrase never runs from one field into the next.
    Only the fields ADR-0017 names count.
    """
    lines: list[str] = [content.headline, content.summary]
    for category in content.skills:
        lines.extend(category.keywords)
    for entry in content.experience:
        lines.append(entry.role)
        lines.extend(entry.bullets)
    for project in content.projects:
        lines.extend((project.name, project.description))
    for certification in content.certifications:
        lines.extend((certification.name, certification.issuer))
    return '\n'.join(lines)


def _contains(
    line: list[tuple[str, str]], needle: list[tuple[str, str]]
) -> bool:
    """Whether ``needle``'s words stand in ``line`` in a row, same gaps.

    The gap before the needle's first word is not compared: ``CI/CD`` is
    found in ``Built CI/CD`` and ``machine learning`` in ``(machine
    learning)``, but ``machine learning`` is not ``machine, learning``.
    """
    width = len(needle)
    for start in range(len(line) - width + 1):
        window = line[start : start + width]
        if all(w == n for (w, _), (n, _) in zip(window, needle)) and all(
            g == n for (_, g), (_, n) in zip(window[1:], needle[1:])
        ):
            return True
    return False


def matched_keywords(keywords: Sequence[str], text: str) -> list[str]:
    """The keywords found in ``text`` as whole words or whole phrases.

    Case-insensitive, on one line at a time, with the keyword's own
    punctuation between its words. Kept in the keywords' own order.
    """
    lines = [_words(line) for line in text.splitlines()]
    found: list[str] = []
    for keyword in keywords:
        needle = _words(' '.join(keyword.split()))
        if needle and any(_contains(line, needle) for line in lines):
            found.append(keyword)
    return found


def score_fit(keywords: Sequence[str], text: str) -> FitResult:
    """Score ``text`` against ``keywords``: the share found, 0 to 100.

    Rounded half up in integer arithmetic (``12.5`` gives ``13``), so the
    result never depends on float representation. No keywords at all gives
    ``score=None``.
    """
    if not keywords:
        return FitResult(score=None, matched=[], missing=[])
    matched = matched_keywords(keywords, text)
    found = set(matched)
    missing = [keyword for keyword in keywords if keyword not in found]
    total = len(keywords)
    score = (200 * len(matched) + total) // (2 * total)
    return FitResult(score=score, matched=matched, missing=missing)
