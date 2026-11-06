"""Compute the diff between an application's CV copy and its baseline.

KODI-017 T091. Shared by the two export use cases
(:mod:`render_diff_markdown`, :mod:`render_diff_pdf`): both need the same
baseline resolution and the same :class:`~app.application.services.cv_diff.CVDiffResult`,
so it lives once here rather than twice.

**Baseline resolution (PINNED):** ``base_snapshot`` if present, else the
current master CV fetched via ``base_cv_id``, else
:class:`~app.core.exceptions.ResourceConflict` (409) - "This CV copy has no
baseline to compare with.", the exact wording T091 pins.

**Baseline label (PINNED):** the current master's name when ``base_cv_id``
still resolves to an owned master CV, else "the original master CV" - the
label is decided independently of *where the content came from*: an older
copy whose snapshot is null but whose master still exists gets the master's
current name; a newer copy whose snapshot exists but whose master has since
been deleted gets "the original master CV" even though its baseline content
came from the snapshot, not the (now-gone) master.
"""

from dataclasses import dataclass

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import TailoredCVContent, TailoredCVDTO
from app.application.services.cv_diff import CVDiffResult, diff_cv
from app.application.use_cases.tailored_cvs.guards import (
    load_owned_application,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)

NO_BASELINE_MESSAGE = 'This CV copy has no baseline to compare with.'
ORIGINAL_MASTER_LABEL = 'the original master CV'

# The fields ``TailoredCVContent`` and ``BaseCVDTO`` share - everything that
# makes up the editable CV document, identity/contact scalars, the summary
# and the seven sections. Explicit rather than a blanket
# ``model_dump(exclude=...)`` so a field either DTO adds later fails loudly
# here instead of silently dropping out of the diff.
_CONTENT_FIELDS = (
    'name',
    'full_name',
    'headline',
    'location',
    'email',
    'phone',
    'summary',
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)


def _content_from_base_cv(base_cv: BaseCVDTO) -> TailoredCVContent:
    return TailoredCVContent(**{
        field: getattr(base_cv, field) for field in _CONTENT_FIELDS
    })


def _content_from_tailored_cv(tailored_cv: TailoredCVDTO) -> TailoredCVContent:
    return TailoredCVContent(**{
        field: getattr(tailored_cv, field) for field in _CONTENT_FIELDS
    })


@dataclass
class CVDiffOutcome:
    """What an export use case needs: the copy, its diff and the label."""

    tailored_cv: TailoredCVDTO
    current: TailoredCVContent
    diff: CVDiffResult
    baseline_label: str


class ComputeTailoredCVDiffUseCase:
    def __init__(
        self,
        tailored_cv_repo: TailoredCVRepository,
        application_repo: ApplicationRepository,
        base_cv_repo: BaseCVRepository,
    ):
        self.tailored_cv_repo = tailored_cv_repo
        self.application_repo = application_repo
        self.base_cv_repo = base_cv_repo

    async def execute(self, application_id: int, user_id: int) -> CVDiffOutcome:
        await load_owned_application(
            self.application_repo, application_id, user_id
        )
        tailored_cv_model = (
            await self.tailored_cv_repo.get_by_application_id_and_user_id(
                application_id, user_id
            )
        )
        if not tailored_cv_model:
            raise ResourceNotFound(
                'CV copy not found', ErrorCode.CV_COPY_NOT_FOUND
            )
        tailored_cv = TailoredCVDTO.model_validate(tailored_cv_model)

        master = None
        if tailored_cv.base_cv_id is not None:
            master = await self.base_cv_repo.get_by_id_and_user_id(
                tailored_cv.base_cv_id, user_id
            )

        if tailored_cv.base_snapshot is not None:
            baseline_content = tailored_cv.base_snapshot
        elif master is not None:
            baseline_content = _content_from_base_cv(
                BaseCVDTO.model_validate(master)
            )
        else:
            raise ResourceConflict(
                NO_BASELINE_MESSAGE, ErrorCode.CV_NO_BASELINE
            )

        baseline_label = (
            master.name if master is not None else ORIGINAL_MASTER_LABEL
        )

        current_content = _content_from_tailored_cv(tailored_cv)
        diff = diff_cv(baseline_content, current_content)

        return CVDiffOutcome(
            tailored_cv=tailored_cv,
            current=current_content,
            diff=diff,
            baseline_label=baseline_label,
        )
