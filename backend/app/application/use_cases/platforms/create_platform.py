from sqlalchemy.exc import IntegrityError

from app.application.dto.platform import PlatformCreateDTO, PlatformDTO
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict
from app.domain.repositories.platform_repository import PlatformRepository
from app.lib.urls import site_host


class CreatePlatformUseCase:
    """``POST /platforms`` (ADR-0014, R-018/R-020): any user - admins
    included, there is no admin branch (owner decision, 2026-09-25) - may
    add a platform that is not listed. It starts **private** to that user,
    until an admin publishes it. A name that matches, ignoring case, a
    platform the user already sees is refused and named in the 409, and so
    is a url on the same site as one of them (``site_host``: ``Remote OK``
    at remoteok.com is the public ``RemoteOK``)."""

    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(
        self, data: PlatformCreateDTO, user_id: int
    ) -> PlatformDTO:
        name = data.name.strip()

        existing = await self.platform_repo.find_visible_by_name(name, user_id)
        if existing:
            raise ResourceConflict(
                f'A platform with this name already exists: {existing.name}',
                ErrorCode.CAT_PLATFORM_NAME_TAKEN,
                params={'name': existing.name},
            )

        host = site_host(data.url)
        if host is not None:
            visible = await self.platform_repo.list_visible(user_id)
            same_site = next(
                (row for row in visible if site_host(row.url) == host), None
            )
            if same_site is not None:
                raise ResourceConflict(
                    'A platform with this website already exists: '
                    f'{same_site.name}',
                    ErrorCode.CAT_PLATFORM_SITE_TAKEN,
                    params={'name': same_site.name},
                )

        try:
            platform = await self.platform_repo.create(
                name=name,
                url=data.url,
                is_public=False,
                created_by=user_id,
            )
        except IntegrityError as err:
            raise ResourceConflict(
                f'A platform with this name already exists: {name}',
                ErrorCode.CAT_PLATFORM_NAME_TAKEN,
                params={'name': name},
            ) from err

        return PlatformDTO.model_validate(platform)
