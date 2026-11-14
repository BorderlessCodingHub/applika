"""The default tailoring binding: a verbatim clone.

``CloneTailoringService`` implements the ``TailoringService`` port by copying
the source master CV field for field - identity and contact included - into
the tailored content. It sets ``was_ai_generated`` to ``False`` and returns an
empty ``adjustments`` list, because nothing here generates anything.

It is the default binding everywhere (ADR-0017): a request that does not ask
for ``tailoring: 'keywords'`` - every installed ``applika-cli`` - gets this
copy. ``KeywordTailoringService`` starts from its output. There is no AI in
either binding. The owner: "In the future i want to connect this to real
models, but this is to the future."

It does no I/O and makes no external call, so it cannot fail on a third party
and cannot touch the source master CV.
"""

from app.application.dto.tailored_cv import (
    TailoredCVContent,
    TailoringRequest,
    TailoringResult,
)


class CloneTailoringService:
    """A ``TailoringService`` that clones the source master CV verbatim."""

    async def tailor(self, request: TailoringRequest) -> TailoringResult:
        """Copy every field of the master CV into a tailored content block.

        The fields are listed one by one on purpose: the copy is the whole
        point of this binding, and a field that stopped being copied has to be
        visible here rather than hidden behind a loop.
        ``test_clone_copies_every_content_field`` fails if this list ever
        falls behind ``TailoredCVContent``.
        """
        base_cv = request.base_cv
        content = TailoredCVContent(
            name=base_cv.name,
            full_name=base_cv.full_name,
            headline=base_cv.headline,
            location=base_cv.location,
            email=base_cv.email,
            phone=base_cv.phone,
            summary=base_cv.summary,
            links=base_cv.links,
            skills=base_cv.skills,
            experience=base_cv.experience,
            projects=base_cv.projects,
            education=base_cv.education,
            certifications=base_cv.certifications,
            languages=base_cv.languages,
        )
        return TailoringResult(
            content=content, adjustments=[], was_ai_generated=False
        )
