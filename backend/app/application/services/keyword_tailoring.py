"""The keyword tailoring binding: the verbatim copy, reordered by job match.

``KeywordTailoringService`` is the second binding of the unchanged
``TailoringService`` port (ADR-0017, amending ADR-0007). It is a port of Ían
Muliterno's heuristic tailor (``cv_tailor_service.py``, ``job_scrapping``
branch, commit ``e670914``), rebuilt on applika's structured master CV
instead of a parsed upload.

It starts from exactly what ``CloneTailoringService`` makes and then only
**reorders**, in three places, by how well each item matches the job
description's keywords (:func:`~app.application.services.keyword_fit.job_keywords`):

* within each skill category, the keywords that match come first;
* the skill categories with more matching keywords come first;
* within each experience entry, the bullets with more matching keywords
  come first.

Every sort is stable, so ties keep the master CV's order. Nothing is added,
removed or rewritten; experience entries, education, projects,
certifications, languages and links keep their order. The result is never
AI-generated, and ``adjustments`` names each section that actually moved. A
blank job description - or one whose words are all stop words - gives
exactly the clone's result.

No model, no network, no external service: only the standard library and
``app``.
"""

from collections.abc import Callable, Sequence

from app.application.dto.base_cv import ExperienceItem, SkillCategoryItem
from app.application.dto.tailored_cv import (
    CVAdjustment,
    TailoringRequest,
    TailoringResult,
)
from app.application.services.clone_tailoring import CloneTailoringService
from app.application.services.keyword_fit import (
    job_keywords,
    matched_keywords,
)


def _stable_by_matches[T](
    items: Sequence[T], matches: Callable[[T], int]
) -> list[T]:
    """More matches first; ``sorted`` is stable, so ties keep their order."""
    return sorted(items, key=lambda item: -matches(item))


def _plural(count: int, singular: str, plural: str) -> str:
    return f'{count} {singular if count == 1 else plural}'


def _reorder_skills(
    skills: list[SkillCategoryItem], terms: Sequence[str]
) -> tuple[list[SkillCategoryItem], CVAdjustment | None]:
    def is_match(keyword: str) -> int:
        return 1 if matched_keywords(terms, keyword) else 0

    categories: list[SkillCategoryItem] = []
    keywords_moved = 0
    for category in skills:
        keywords = _stable_by_matches(category.keywords, is_match)
        if keywords != category.keywords:
            keywords_moved += 1
            category = category.model_copy(update={'keywords': keywords})
        categories.append(category)

    ordered = _stable_by_matches(
        categories,
        lambda category: sum(map(is_match, category.keywords)),
    )
    # Compared by position, not by id: ids are client-generated and not
    # guaranteed unique.
    categories_moved = any(
        moved is not kept
        for moved, kept in zip(ordered, categories, strict=True)
    )

    if categories_moved and keywords_moved:
        description = 'Skill categories and keywords reordered by job match'
    elif categories_moved:
        description = 'Skill categories reordered by job match'
    elif keywords_moved:
        description = 'Keywords reordered by job match in ' + _plural(
            keywords_moved, 'category', 'categories'
        )
    else:
        return skills, None
    return ordered, CVAdjustment(section='skills', description=description)


def _reorder_experience(
    experience: list[ExperienceItem], terms: Sequence[str]
) -> tuple[list[ExperienceItem], CVAdjustment | None]:
    def matches(bullet: str) -> int:
        return len(matched_keywords(terms, bullet))

    entries: list[ExperienceItem] = []
    moved = 0
    for entry in experience:
        bullets = _stable_by_matches(entry.bullets, matches)
        if bullets != entry.bullets:
            moved += 1
            entry = entry.model_copy(update={'bullets': bullets})
        entries.append(entry)

    if not moved:
        return experience, None
    return entries, CVAdjustment(
        section='experience',
        description='Bullets reordered by job match in '
        + _plural(moved, 'entry', 'entries'),
    )


class KeywordTailoringService:
    """A ``TailoringService`` that reorders the verbatim copy by job match."""

    async def tailor(self, request: TailoringRequest) -> TailoringResult:
        clone = await CloneTailoringService().tailor(request)
        terms = job_keywords(request.job_description, [])
        if not terms:
            return clone

        # ``model_copy`` builds new items and new lists: the clone shares its
        # section items with the master CV, which must never move.
        skills, skills_note = _reorder_skills(clone.content.skills, terms)
        experience, experience_note = _reorder_experience(
            clone.content.experience, terms
        )
        adjustments = [
            note for note in (skills_note, experience_note) if note is not None
        ]
        content = clone.content.model_copy(
            update={'skills': skills, 'experience': experience}
        )
        return TailoringResult(
            content=content, adjustments=adjustments, was_ai_generated=False
        )
