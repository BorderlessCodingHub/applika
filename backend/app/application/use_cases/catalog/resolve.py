"""Shared catalog-visibility resolution for the application write paths
(ADR-0014). ``CreateApplicationUseCase`` and ``UpdateApplicationUseCase``
both need to turn a submitted platform id / company id-or-input into a row
the caller may actually see, refusing with ``ResourceNotFound`` and writing
nothing otherwise (R-024, R-026: "a 404 writes nothing"). Kept out of the
application use cases so the rule lives in exactly one place.
"""

from app.application.dto.application import ApplicationCompanyInputDTO
from app.application.dto.company import CompanyCreateDTO
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.models import PlatformModel
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository
from app.lib.urls import normalize_company_url


async def ensure_platform_visible(
    platform_repo: PlatformRepository, platform_id: int, user_id: int
) -> PlatformModel:
    """The platform, only when ``user_id`` may see it - public, or private
    and created by that user. Otherwise ``ResourceNotFound`` (R-023)."""
    platform = await platform_repo.get_visible(platform_id, user_id)
    if not platform:
        raise ResourceNotFound(
            'Platform not found', ErrorCode.CAT_PLATFORM_NOT_FOUND
        )
    return platform


async def resolve_company(
    company_repo: CompanyRepository,
    company: int | ApplicationCompanyInputDTO,
    user_id: int,
) -> tuple[int | None, str]:
    """Turn the submitted ``company`` (an id, or a ``{name, url}`` input)
    into ``(company_id, company_name)`` for the application row.

    * An id must be visible to ``user_id`` (public or the caller's own
      private row) - otherwise ``ResourceNotFound('Company not found')``,
      before anything is written (R-024).
    * ``{name, url}`` reuses a visible company matching the normalised url
      and name, else creates a new **private** company owned by
      ``user_id`` - admins included, there is no admin branch here (owner
      decision, 2026-09-25). A same-instant race that loses the create's own
      unique index is read back instead of failing the request.
    * ``{name, url: null}`` stays free text: no row, no id (R-024-3).
    """
    if isinstance(company, int):
        existing = await company_repo.get_visible(company, user_id)
        if not existing:
            raise ResourceNotFound(
                'Company not found', ErrorCode.CAT_COMPANY_NOT_FOUND
            )
        return existing.id, existing.name

    if company.url is None:
        return None, company.name

    normalized_url = normalize_company_url(str(company.url))

    existing = await company_repo.find_visible_match(
        company.name, normalized_url, user_id
    )
    if existing:
        return existing.id, existing.name

    create_dto = CompanyCreateDTO(
        name=company.name, url=company.url, created_by=user_id
    ).model_copy(update={'url': normalized_url})

    try:
        new_company = await company_repo.create(create_dto, is_public=False)
    except ResourceConflict:
        # Another request created the same visible row between the match
        # check above and this insert - re-read it instead of failing.
        existing = await company_repo.find_visible_match(
            company.name, normalized_url, user_id
        )
        if existing:
            return existing.id, existing.name
        raise
    return new_company.id, new_company.name
