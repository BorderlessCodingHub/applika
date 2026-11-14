from sqlalchemy.exc import IntegrityError

from app.application.dto.platform import PlatformDTO
from app.config.logging import logger
from app.core.error_codes import ErrorCode
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
            raise ResourceNotFound(
                'Platform not found', ErrorCode.CAT_PLATFORM_NOT_FOUND
            )

        if platform.is_public:
            return await self._dto(platform)

        collision = await self.platform_repo.find_public_by_name(
            platform.name, exclude_id=platform.id
        )
        if collision:
            raise ResourceConflict(
                'A public platform with this name already exists: '
                f'{collision.name} (id {collision.id})',
                ErrorCode.ADM_PUBLIC_PLATFORM_EXISTS,
                params={'name': collision.name, 'id': str(collision.id)},
            )

        # Captured before the update: a rollback on the shared session (the
        # repo's own IntegrityError handling) expires this ORM object, and a
        # synchronous attribute read on an expired async object raises
        # MissingGreenlet instead of the 409 below. There is today no unique
        # index on public platform names, so this branch cannot yet run in
        # production - kept as a defensive backstop, same shape as the
        # company side, in case one is ever added.
        name = platform.name
        platform.is_public = True
        try:
            platform = await self.platform_repo.update(platform)
        except IntegrityError as err:
            collision = await self.platform_repo.find_public_by_name(
                name, exclude_id=platform_id
            )
            if collision:
                raise ResourceConflict(
                    'A public platform with this name already exists: '
                    f'{collision.name} (id {collision.id})',
                    ErrorCode.ADM_PUBLIC_PLATFORM_EXISTS,
                    params={'name': collision.name, 'id': str(collision.id)},
                ) from err
            raise ResourceConflict(
                f'A public platform with this name already exists: {name}',
                ErrorCode.ADM_PUBLIC_PLATFORM_RACE,
                params={'name': name},
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
