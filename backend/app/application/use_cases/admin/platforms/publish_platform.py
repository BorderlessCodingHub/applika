from sqlalchemy.exc import IntegrityError

from app.application.dto.platform import PlatformDTO
from app.config.logging import logger
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.repositories.platform_repository import PlatformRepository


class PublishPlatformUseCase:
    """``POST /admin/platforms/{id}/publish`` (ADR-0014, R-025/R-026): makes
    a private platform visible to every user, keeping who added it.
    Idempotent - publishing an already public row is a no-op 200. Refused
    with a 409 naming the public row it would duplicate on ``lower(name)``
    (there is no uniqueness among *existing* public platform names, so a
    publish is the one place a collision is checked and refused)."""

    def __init__(self, platform_repo: PlatformRepository):
        self.platform_repo = platform_repo

    async def execute(self, platform_id: int, admin_id: int) -> PlatformDTO:
        platform = await self.platform_repo.get_by_id(platform_id)
        if not platform:
            raise ResourceNotFound('Platform not found')

        if platform.is_public:
            return await self._dto(platform)

        collision = await self.platform_repo.find_public_by_name(
            platform.name, exclude_id=platform.id
        )
        if collision:
            raise ResourceConflict(
                'A public platform with this name already exists: '
                f'{collision.name} (id {collision.id})'
            )

        platform.is_public = True
        try:
            platform = await self.platform_repo.update(platform)
        except IntegrityError as err:
            raise ResourceConflict(
                'A public platform with this name already exists: '
                f'{platform.name}'
            ) from err

        logger.info(
            f'Admin published platform: {platform_id}',
            extra={
                'extra_data': {
                    'event': 'admin_publish_platform',
                    'platform_id': platform_id,
                    'admin_id': admin_id,
                }
            },
        )

        return await self._dto(platform)

    async def _dto(self, platform) -> PlatformDTO:
        return PlatformDTO(
            id=platform.id,
            created_at=platform.created_at,
            updated_at=platform.updated_at,
            name=platform.name,
            url=platform.url,
            is_public=platform.is_public,
            created_by=platform.created_by,
            created_by_username=(
                platform.created_by_user.username
                if platform.created_by_user
                else None
            ),
        )
